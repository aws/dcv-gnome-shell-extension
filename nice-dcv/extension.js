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

/* exported init */

const ExtensionUtils = imports.misc.extensionUtils;
const GdmUtil = imports.gdm.util;
const Main = imports.ui.main;

const Me = ExtensionUtils.getCurrentExtension();
const Dcv = Me.imports.dcv;

let DcvShellUserVerifier = class DcvShellUserVerifier extends GdmUtil.ShellUserVerifier {
    constructor(client, params) {
        super(client, params);

        this.addCredentialManager(Dcv.SERVICE_NAME, Dcv.getDcvCredentialsManager());
    }
};

class Extension {
    constructor() {
        this._remoteAccessController = global.backend.get_remote_access_controller();

        this._originalShellUserVerifier = GdmUtil.ShellUserVerifier;
        this._originalInhibit = this._remoteAccessController.inhibit_remote_access;
        this._originalUninhibit = this._remoteAccessController.uninhibit_remote_access;
    }

    enable() {
        GdmUtil.ShellUserVerifier = DcvShellUserVerifier;

        // FIXME: Remove this code once we have headless sessions.
        this._remoteAccessController.uninhibit_remote_access();
        this._remoteAccessController.inhibit_remote_access = () => {};
        this._remoteAccessController.uninhibit_remote_access = () => {};

        if (Main.screenShield) {
            Main.screenShield.addCredentialManager(Dcv.SERVICE_NAME, Dcv.getDcvCredentialsManager());
        }

        log(`${Me.metadata.name} enabled`);
    }

    disable() {
        GdmUtil.ShellUserVerifier = this._originalShellUserVerifier;
        this._remoteAccessController.inhibit_remote_access = this._originalInhibit;
        this._remoteAccessController.uninhibit_remote_access = this._originalUninhibit;

        if (Main.screenShield) {
            Main.screenShield.removeCredentialManager(Dcv.SERVICE_NAME);
        }

        log(`${Me.metadata.name} disabled`);
    }
}

function init() {
    return new Extension();
}

