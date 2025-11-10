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
import * as ObjectManager from 'resource:///org/gnome/shell/misc/objectManager.js';

const dbusName = 'com.nicesoftware.DcvServer'
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

const GdmRemoteDisplayIface = `
<node>
<interface name="org.gnome.DisplayManager.RemoteDisplay">
  <property name="SessionId" type="s" access="read"/>
  <property name="RemoteId" type="o" access="read"/>
</interface>
</node>
`;

let _dcvCredentialsManagers = new Map();

function parseRemoteIdToDcvSessionId(remoteId) {
    const prefix = '/com/amazon/dcv/';
    if (!remoteId || !remoteId.startsWith(prefix)) {
        return null;
    }

    const encodedId = remoteId.substring(prefix.length);
    if (encodedId.length % 2 !== 0) {
        return null;
    }

    let decodedId = '';
    for (let i = 0; i < encodedId.length; i += 2) {
        const hexByte = encodedId.substring(i, i + 2);
        const charCode = parseInt(hexByte, 16);
        if (isNaN(charCode)) {
            return null;
        }
        decodedId += String.fromCharCode(charCode);
    }

    return decodedId;
}

function DcvCredentials() {
    var self = new Gio.DBusProxy({
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

var DcvCredentialsManager = class DcvCredentialsManager extends Credential.CredentialManager {
    constructor(sessionId) {
        super(SERVICE_NAME);
        this._dcvSessionId = null;

        this._objectManager = new ObjectManager.ObjectManager({
            connection: Gio.DBus.system,
            name: 'org.gnome.DisplayManager',
            objectPath: '/org/gnome/DisplayManager/Displays',
            knownInterfaces: [GdmRemoteDisplayIface],
            onLoaded: () => {
                const remoteDisplays = this._objectManager.getProxiesForInterface('org.gnome.DisplayManager.RemoteDisplay');
                for (const display of remoteDisplays) {
                    if (display.SessionId !== sessionId) {
                        continue;
                    }

                    const remoteId = display.RemoteId;
                    const dcvSessionId = parseRemoteIdToDcvSessionId(remoteId);
                    if (dcvSessionId === null) {
                        // Despite being the right remote display, this is not managed by DCV.
                        return;
                    }

                    this._dcvSessionId = dcvSessionId;
                    break;
                }

                const sessionType = this._dcvSessionId ? 'virtual' : 'console';
                const sessionName = this._dcvSessionId ? ` name: '${this._dcvSessionId}'` : '';
                console.log(`${SERVICE_NAME}: DCV session type '${sessionType}'${sessionName}`);

                this._credentials = new DcvCredentials();
                this._credentials.connectSignal('UserAuthenticated', this._onUserAuthenticated.bind(this));
            }
        });
    }

    _onUserAuthenticated(proxy, sender, [session, token]) {
        if (this._dcvSessionId === null) {
            const remoteDisplays = this._objectManager.getProxiesForInterface('org.gnome.DisplayManager.RemoteDisplay');
            for (const display of remoteDisplays) {
                const dcvSessionId = parseRemoteIdToDcvSessionId(display.RemoteId);
                if (dcvSessionId !== null) {
                    // We are a console session and there is at least one
                    // DCV virtual session, don't log in.
                    return;
                }
            }
        }

        if (this._dcvSessionId !== null && this._dcvSessionId !== session) {
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
