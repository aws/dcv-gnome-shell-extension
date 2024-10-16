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

import * as Dcv from './dcv.js';

let DcvShellUserVerifier = class DcvShellUserVerifier extends GdmUtil.ShellUserVerifier {
    constructor(client, params) {
        super(client, params);
        this.addCredentialManager(Dcv.SERVICE_NAME, Dcv.getDcvCredentialsManager());
    }
};

function _createDcvUserVerifier(gdmClient, params) {
    return new DcvShellUserVerifier(gdmClient, params);
}

export default class DcvExtension extends Extension {
    constructor(metadata) {
        super(metadata);

        if (AuthPrompt.AuthPrompt.prototype._createUserVerifier === undefined) {
            this._supported = false;
            return;
        }

        this._supported = true;
        this._remoteAccessController = global.backend.get_remote_access_controller();

        this._originalCreateUserVerifier = AuthPrompt.AuthPrompt.prototype._createUserVerifier;
        this._originalInhibit = this._remoteAccessController.inhibit_remote_access;
        this._originalUninhibit = this._remoteAccessController.uninhibit_remote_access;
    }

    enable() {
        if (!this._supported) {
            Main.notifyError(`Unable to load '${this.metadata.name}'`,
                             "The extension needs a newer GNOME Shell version");
            return;
        }

        AuthPrompt.AuthPrompt.prototype._createUserVerifier = _createDcvUserVerifier;

        // FIXME: Remove this code once we have headless sessions.
        this._remoteAccessController.uninhibit_remote_access();
        this._remoteAccessController.inhibit_remote_access = () => {};
        this._remoteAccessController.uninhibit_remote_access = () => {};

        if (Main.screenShield) {
            Main.screenShield.addCredentialManager(Dcv.SERVICE_NAME, Dcv.getDcvCredentialsManager());
        }

        console.log(`${this.metadata.name} enabled`);
    }

    disable() {
        if (!this._supported) {
            return;
        }

        AuthPrompt.AuthPrompt.prototype._createUserVerifier = this._originalCreateUserVerifier;
        this._remoteAccessController.inhibit_remote_access = this._originalInhibit;
        this._remoteAccessController.uninhibit_remote_access = this._originalUninhibit;

        if (Main.screenShield) {
            Main.screenShield.removeCredentialManager(Dcv.SERVICE_NAME);
        }

        console.log(`${this.metadata.name} disabled`);
    }
}

