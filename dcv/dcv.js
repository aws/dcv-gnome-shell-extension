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

import Gio from 'gi://Gio';
import * as Credential from 'resource:///org/gnome/shell/gdm/credentialManager.js';

const dbusName = 'com.nicesoftware.DcvServer';
const dbusPath = '/com/nicesoftware/DcvServer';
const dbusInterface = 'com.nicesoftware.DcvServer.Credentials';

export const SERVICE_NAME = 'dcv-graphical-sso';

const DcvCredentialsIface = `<node>
<interface name="${dbusInterface}">
<signal name="UserAuthenticated">
    <arg type="s" name="session"/>
    <arg type="s" name="token"/>
</signal>
</interface>
</node>`;
const DcvCredentialsInfo = Gio.DBusInterfaceInfo.new_for_xml(DcvCredentialsIface);

let _dcvCredentialsManagers = new Map();

function DcvCredentials() {
    const self = new Gio.DBusProxy({
        g_connection: Gio.DBus.system,
        g_interface_name: DcvCredentialsInfo.name,
        g_interface_info: DcvCredentialsInfo,
        g_name: dbusName,
        g_object_path: dbusPath,
        g_flags: Gio.DBusProxyFlags.DO_NOT_LOAD_PROPERTIES,
    });
    self.init(null);
    return self;
}

const DcvCredentialsManager = class DcvCredentialsManager extends Credential.CredentialManager {
    constructor(sessionId) {
        super(SERVICE_NAME);
        this._sessionId = sessionId;

        this._credentials = new DcvCredentials();
        this._credentials.connectSignal('UserAuthenticated', this._onUserAuthenticated.bind(this));
    }

    _onUserAuthenticated(proxy, sender, [session, token]) {
        if (session !== this._sessionId) {
            return;
        }

        this.token = token;
    }
};

/**
 * @returns {DcvCredentialsManager}
 */
export function getDcvCredentialsManager(sessionId) {
    if (!_dcvCredentialsManagers.has(sessionId)) {
        _dcvCredentialsManagers.set(sessionId, new DcvCredentialsManager(sessionId));
    }

    return _dcvCredentialsManagers.get(sessionId);
}
