// -*- mode: js; js-indent-level: 4; indent-tabs-mode: nil -*-

/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *
 * This program is free software; you can redistribute it and/or
 * modify it under the terms of the GNU General Public License
 * as published by the Free Software Foundation; version 2
 * of the License.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program. If not, see <http://www.gnu.org/licenses/gpl-2.0.html>.
 */

import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as AuthPrompt from 'resource:///org/gnome/shell/gdm/authPrompt.js';
import * as GdmUtil from 'resource:///org/gnome/shell/gdm/util.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

const SystemdLoginSessionIface = `
<node>
<interface name="org.freedesktop.login1.Session">
  <property name="Id" type="s" access="read"/>
  <property name="Remote" type="b" access="read"/>
</interface>
</node>
`;

const SystemdLoginSession = Gio.DBusProxy.makeProxyWrapper(SystemdLoginSessionIface);

import * as Dcv from './dcv.js';

let DcvShellUserVerifier = class DcvShellUserVerifier extends GdmUtil.ShellUserVerifier {
    constructor(client, params, sessionId) {
        super(client, params);
        this.addCredentialManager(Dcv.SERVICE_NAME, Dcv.getDcvCredentialsManager(sessionId));
    }
};

export default class DcvExtension extends Extension {
    constructor(metadata) {
        super(metadata);

        if (AuthPrompt.AuthPrompt.prototype._createUserVerifier === undefined) {
            console.log(`${this.metadata.name}: Not supported`);
            this._supported = false;
            return;
        }

        this._supported = true;
        this._remoteAccessController = global.backend.get_remote_access_controller();

        this._originalCreateUserVerifier = AuthPrompt.AuthPrompt.prototype._createUserVerifier;
        this._originalInhibit = this._remoteAccessController.inhibit_remote_access;
        this._originalUninhibit = this._remoteAccessController.uninhibit_remote_access;
    }

    _uninhibitRemoteAccess() {
        this._remoteAccessController.uninhibit_remote_access();
        this._remoteAccessController.inhibit_remote_access = () => {};
        this._remoteAccessController.uninhibit_remote_access = () => {};
    }

    _inhibitRemoteAccess() {
        this._remoteAccessController.inhibit_remote_access();
        this._remoteAccessController.inhibit_remote_access = this._originalInhibit;
        this._remoteAccessController.uninhibit_remote_access = this._originalUninhibit;
    }

    /* We should use LoginManager::getCurrentSessionProxy() from GNOME Shell for simplicity but it is
     * buggy. Use our own implementation until this commit is ubiquitous:
     * https://gitlab.gnome.org/GNOME/gnome-shell/-/commit/5db3a2b7bcfebdcc71038df890ae44308c98b95e
     */
    async getCurrentSessionProxy() {
        if (this._currentSession)
            return this._currentSession;

        try {
            this._currentSession = await SystemdLoginSession.newAsync(
                Gio.DBus.system, 'org.freedesktop.login1', '/org/freedesktop/login1/session/auto');
            return this._currentSession;
        } catch (error) {
            console.error(`${this.metadata.name}: Could not get a proxy for the current session: ${error}`);
            return null;
        }
    }

    enable() {
        if (!this._supported) {
            Main.notifyError(`Unable to load '${this.metadata.name}'`,
                             "The extension needs a newer GNOME Shell version");
            return;
        }

        this.getCurrentSessionProxy().then(session => {
            if (!session) {
                console.error(`${this.metadata.name}: Could not get session proxy`);
                return;
            }

            const sessionId = session.Id;
            const sessionRemote = session.Remote;
            console.log(`${this.metadata.name}: Session '${sessionId}', Remote '${sessionRemote}'`);

            if (!sessionRemote) {
                // For headless sessions we don't need to uninhibit remote access
                // because it is allowed by default.
                this._uninhibitRemoteAccess();
            }

            AuthPrompt.AuthPrompt.prototype._createUserVerifier = (gdmClient, params) => {
                return new DcvShellUserVerifier(gdmClient, params, sessionId);
            };

            if (Main.screenShield) {
                Main.screenShield.addCredentialManager(Dcv.SERVICE_NAME, Dcv.getDcvCredentialsManager(sessionId));
            }

            console.log(`${this.metadata.name}: Enabled`);
        });
    }

    disable() {
        if (!this._supported) {
            return;
        }

        AuthPrompt.AuthPrompt.prototype._createUserVerifier = this._originalCreateUserVerifier;
        this._inhibitRemoteAccess();

        if (Main.screenShield) {
            Main.screenShield.removeCredentialManager(Dcv.SERVICE_NAME);
        }

        console.log(`${this.metadata.name}: Disabled`);
    }
}
