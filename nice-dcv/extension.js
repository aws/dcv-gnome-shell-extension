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
const GdmAuthPrompt = imports.gdm.authPrompt;
const GObject = imports.gi.GObject;
const OVirt = imports.gdm.oVirt;
const Vmware = imports.gdm.vmware;

const Me = ExtensionUtils.getCurrentExtension();
const Dcv = Me.imports.dcv;

const AuthPromptMode = GdmAuthPrompt.AuthPromptMode;
const AuthPromptStatus = GdmAuthPrompt.AuthPromptStatus;
const BeginRequestType = GdmAuthPrompt.BeginRequestType;

let DcvShellUserVerifier = class DcvShellUserVerifier extends GdmUtil.ShellUserVerifier {
    constructor(client, params) {
        super(client, params);

        let dcvCredentialManager = Dcv.getDcvCredentialsManager();
        if (dcvCredentialManager.token) {
            this._onCredentialManagerAuthenticated(dcvCredentialManager,
                                                   dcvCredentialManager.token);
        }

        dcvCredentialManager.connectObject('user-authenticated',
                                           this._onCredentialManagerAuthenticated.bind(this),
                                           this);

        this._credentialManagers[Dcv.SERVICE_NAME] = dcvCredentialManager;
    }
};

let DcvAuthPrompt = GObject.registerClass(class DcvAuthPrompt extends GdmAuthPrompt.AuthPrompt {
    reset() {
        let oldStatus = this.verificationStatus;
        this.verificationStatus = AuthPromptStatus.NOT_VERIFYING;
        this.cancelButton.reactive = this._hasCancelButton;
        this.cancelButton.can_focus = this._hasCancelButton;
        this._preemptiveAnswer = null;

        if (this._userVerifier)
            this._userVerifier.cancel();

        this._queryingService = null;
        this.clear();
        this._message.opacity = 0;
        this.setUser(null);
        this._updateEntry(true);
        this.stopSpinning();

        if (oldStatus == AuthPromptStatus.VERIFICATION_FAILED)
            this.emit('failed');
        else if (oldStatus === AuthPromptStatus.VERIFICATION_CANCELLED)
            this.emit('cancelled');

        let beginRequestType;

        if (this._mode == AuthPromptMode.UNLOCK_ONLY) {
            // The user is constant at the unlock screen, so it will immediately
            // respond to the request with the username
            if (oldStatus === AuthPromptStatus.VERIFICATION_CANCELLED)
                return;
            beginRequestType = BeginRequestType.PROVIDE_USERNAME;
        } else if (this._userVerifier.serviceIsForeground(OVirt.SERVICE_NAME) ||
                   this._userVerifier.serviceIsForeground(Vmware.SERVICE_NAME) ||
                   this._userVerifier.serviceIsForeground(Dcv.SERVICE_NAME) ||
                   this._userVerifier.serviceIsForeground(GdmUtil.SMARTCARD_SERVICE_NAME)) {
            // We don't need to know the username if the user preempted the login screen
            // with a smartcard or with preauthenticated oVirt credentials
            beginRequestType = BeginRequestType.DONT_PROVIDE_USERNAME;
        } else if (oldStatus === AuthPromptStatus.VERIFICATION_IN_PROGRESS) {
            // We're going back to retry with current user
            beginRequestType = BeginRequestType.REUSE_USERNAME;
        } else {
            // In all other cases, we should get the username up front.
            beginRequestType = BeginRequestType.PROVIDE_USERNAME;
        }

        this.emit('reset', beginRequestType);
    }
});

class Extension {
    constructor() {
        this._originalShellUserVerifier = GdmUtil.ShellUserVerifier;
        this._originalAuthPrompt = GdmAuthPrompt.AuthPrompt;
    }

    enable() {
        GdmUtil.ShellUserVerifier = DcvShellUserVerifier;
        GdmAuthPrompt.AuthPrompt = DcvAuthPrompt;
        log(`${Me.metadata.name} enabled`);
    }

    disable() {
        GdmUtil.ShellUserVerifier = this._originalShellUserVerifier;
        GdmAuthPrompt.AuthPrompt = this._originalAuthPrompt;
        log(`${Me.metadata.name} disabled`);
    }
}

function init() {
    Dcv.getDcvCredentialsManager();
    return new Extension();
}

