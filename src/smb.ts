import { Service, PlatformAccessory, CharacteristicValue } from 'homebridge';
import { SmbAction } from './model/smbaction';

import { FellerWiserPlatform } from './platform';

/**
 * Platform Accessory
 * An instance of this class is created for each accessory your platform registers
 * Each accessory may expose multiple services of different service types.
 */
export class Smb {
  protected service: Service;
  protected action: number;

  constructor(
    protected readonly platform: FellerWiserPlatform,
    protected readonly accessory: PlatformAccessory,
  ) {

    // set accessory information
    this.accessory.getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Manufacturer, 'Feller AG')
      .setCharacteristic(this.platform.Characteristic.Model, 'undefined')
      .setCharacteristic(this.platform.Characteristic.SerialNumber, accessory.UUID);

    // get the StatelessProgrammableSwitch service if it exists, otherwise create a new StatelessProgrammableSwitch service
    // you can create multiple services for each accessory
    this.service = this.accessory.getService(this.platform.Service.StatelessProgrammableSwitch)
        || this.accessory.addService(this.platform.Service.StatelessProgrammableSwitch);

    // set the service name, this is what is displayed as the default name on the Home app
    // in this example we are using the name we stored in the `accessory.context` in the `discoverDevices` method.
    this.service.setCharacteristic(this.platform.Characteristic.Name, accessory.context.load.name);

    // each service must implement at-minimum the "required characteristics" for the given service type
    // see https://developers.homebridge.io/#/service/Lightbulb

    // register handlers for the On/Off Characteristic
    this.service.getCharacteristic(this.platform.Characteristic.ProgrammableSwitchEvent)
      .onGet(this.getOn.bind(this));               // GET - bind to the `getOn` method below

    this.action = this.platform.Characteristic.ProgrammableSwitchEvent.SINGLE_PRESS;

    this.platform.fellerClient?.loadStateChange.on(this.accessory.context.load.id.toString(), (SmbAction) => this.updateAction(SmbAction));
  }

  async getOn(): Promise<CharacteristicValue> {
    return this.action;
  }

  async updateAction(smbAction: SmbAction) : Promise<void> {

    // Currently only click is supported!
    this.platform.log.info('smb action ' + smbAction.action + ' received from ' + this.accessory.displayName);
    switch (smbAction.action) {
      case 'click':
        this.action = this.platform.Characteristic.ProgrammableSwitchEvent.SINGLE_PRESS;
        break;
      case 'double':
        this.action = this.platform.Characteristic.ProgrammableSwitchEvent.DOUBLE_PRESS;
        break;
      case 'long':
        this.action = this.platform.Characteristic.ProgrammableSwitchEvent.LONG_PRESS;
        break;
      case 'single':
        this.action = this.platform.Characteristic.ProgrammableSwitchEvent.SINGLE_PRESS;
        break;
    }
    this.service.updateCharacteristic(this.platform.Characteristic.ProgrammableSwitchEvent, this.action);
  }
}
