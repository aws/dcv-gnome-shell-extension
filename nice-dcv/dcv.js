// -*- mode: js; js-indent-level: 4; indent-tabs-mode: nil -*-
/* exported getDcvCredentialsManager */

const Gio = imports.gi.Gio;
const Signals = imports.signals;
const Credential = imports.gdm.credentialManager;

const dbusPath = '/com/nicesoftware/dcvagent/Credentials';
const dbusInterface = 'com.nicesoftware.dcvagent.Credentials';

var SERVICE_NAME = 'dcv-graphical-sso';

const DcvCredentialsIface = `<node>
<interface name="${dbusInterface}">
<signal name="UserAuthenticated">
    <arg type="s" name="token"/>
</signal>
</interface>
</node>`;


const DcvCredentialsInfo = Gio.DBusInterfaceInfo.new_for_xml(DcvCredentialsIface);

let _dcvCredentialsManager = null;

function DcvCredentials() {
    var self = new Gio.DBusProxy({
        g_connection: Gio.DBus.system,
        g_interface_name: DcvCredentialsInfo.name,
        g_interface_info: DcvCredentialsInfo,
        g_name: dbusInterface,
        g_object_path: dbusPath,
        g_flags: Gio.DBusProxyFlags.DO_NOT_LOAD_PROPERTIES,
    });
    self.init(null);
    return self;
}

var DcvCredentialsManager = class DcvCredentialsManager extends Credential.CredentialManager {
    constructor() {
        super(SERVICE_NAME);
        this._credentials = new DcvCredentials();
        this._credentials.connectSignal('UserAuthenticated',
            (proxy, sender, [token]) => {
                this.token = token;
            });
    }
};
Signals.addSignalMethods(DcvCredentialsManager.prototype);

function getDcvCredentialsManager() {
    if (!_dcvCredentialsManager)
        _dcvCredentialsManager = new DcvCredentialsManager();

    return _dcvCredentialsManager;
}

