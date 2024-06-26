
import { Logger } from 'homebridge';
import fetch from 'node-fetch';
import { JSendResponse } from './JSendResponse';
import { Load } from './load';
import { Smb } from './smb';
import { LoadState } from './loadstate';
import { SmbAction } from './smbaction';
import { EventEmitter } from 'stream';
import { LoadCtrl } from '../types';
import WebSocket from 'ws';


export class FellerWiserClient{
  private authkey: string;
  private authToken : string | undefined;
  private log : Logger;
  private websocket : WebSocket;
  private baseUrl: string;
  public loadStateChange : EventEmitter;

  constructor(config, log) {

    if (!config.ip){
      throw new Error('expected a configured ip-address for the Wiser device');
    }

    if (!config.authkey){
      throw new Error('expected a configured api-key for communication to the Wiser device');
    }

    this.log = log;
    this.authkey = config.authkey;
    this.log.debug('feller client built');
    this.loadStateChange = new EventEmitter();

    const createWebSocket = (ip = config.ip, authkey = config.authkey) => {
      const result = new WebSocket('ws://' + ip + '/api', [], {headers: {'Authorization': 'Bearer ' + authkey}} );

      result.on('message', (message) => {
        this.log.debug('message received', message.toLocaleString());
        const jsonMessage = JSON.parse(message.toLocaleString());
        // Is it a message from a load interaction?
        if (jsonMessage.load !== undefined) {
          const id = jsonMessage.load.id as number;
          const loadState = jsonMessage.load.state as LoadState;
          // inform the listener(s) for this load
          this.loadStateChange.emit(id.toString(), loadState);
        } else {
          // Is it a  message from a smb interaction?
          if (jsonMessage.smb !== undefined) {
            const id = jsonMessage.smb.id as number;
            const smbAction = jsonMessage.smb as SmbAction;
            // inform the listener(s) for this smb
            this.loadStateChange.emit(id.toString(), smbAction);
          }
        }
      });

      result.on('open', () => {
        this.log.debug('websocket opened, sending command "dump_loads"');
        result.send(JSON.stringify({'command': 'dump_loads'}));

        const keepalive = setInterval(() => {
          result.ping((error) => {
            if (error) {
              this.log.error('error on keepalive websocket', error);
              // if readystate = 3 (CLOSED) => reconnect
              if (this.websocket.readyState === 3){
                this.log.error('reconnecting');
                this.websocket = createWebSocket();
              }
              clearInterval(keepalive);
            }
          });
          this.log.debug('ping sent');
        }, 3600000 );
      });

      result.on('close', (code, data) => {
        this.log.info('websocket connetion closed with code', code, 'reason: ', data.toString());
        if (code === 1006){
          this.log.error('cannot connect websocket');
          return;
        }
        this.websocket.terminate();
        this.websocket = createWebSocket();
      });

      result.on('error', (error) => {
        this.log.error('Error on websocket occured with message:', error.message);
        if (error.message === 'getaddrinfo ENOTFOUND'){
          return;
        }
        this.websocket = createWebSocket();
      });

      return result;
    };

    this.websocket = createWebSocket(config.ip, config.authkey);
    this.baseUrl = 'http://' + config.ip + '/api';
  }


  async getLoads() : Promise<Load[]>{
    // fetch the loads through the http-api
    const result = await fetch (this.baseUrl + '/loads', {headers: {'Authorization': 'Bearer ' + this.authkey}})
      .then((response) => {
        return response.json();
      })
      .then((json) => {
        this.log.debug(json);
        if (json.status === 'error'){
          this.log.error('error occurred', json.message);
          throw new Error('an error occurred fetching the loads');
        }
        const loads = json.data as Load[];
        return loads;
      });
    return result;
  }

  // get a list of all smartbuttons (smb)
  // Are really all smart buttons scene buttons?
  // Scene buttons must have the ws_smb.py script stored as a job.
  async getSmbs() : Promise<Smb[]>{
    const result = await fetch (this.baseUrl + '/smartbuttons', {headers: {'Authorization': 'Bearer ' + this.authkey}})
      .then((response) => {
        return response.json();
      })
      .then((json) => {
        this.log.debug(json);
        if (json.status === 'error'){
          this.log.error('error occurred', json.message);
          throw new Error('an error occurred fetching the smart buttons');
        }
        const smbs = json.data as Smb[];
        return smbs;
      });
    return result;
  }

  // dont use this method for getting a single load - they will be emitted via the websocket (see constructor)
  async getLoadState(id: number) : Promise<LoadState>{

    this.log.debug('fetching loadstate via API', this.baseUrl + '/loads/' + id + '/state');
    return fetch(this.baseUrl + '/loads/' + id + '/state', {headers: {'Authorization': 'Bearer ' + this.authkey}})
      .then((response) => {
        return response.json() as JSendResponse;
      })
      .then((response) => {
        return response.data.state as LoadState;
      });

  }

  // sets the load state of the specified load with the given id
  async setLoadState(id: number, state: LoadState): Promise<LoadState>{
    this.log.debug('setLoadstate for id ' + id);
    return fetch(this.baseUrl + '/loads/' + id + '/target_state', {
      headers: {'Authorization': 'Bearer ' + this.authToken},
      method: 'put',
      body: JSON.stringify(state),
    })
      .then((response) => {
        return response.json();
      })
      .then((json) => {
        if (json.status === 'success'){
          return json.data as LoadState;
        } else {
          throw new Error(json.message);
        }
      });

  }

  async ctrlLoad(id: number, loadCtrl : LoadCtrl){
    return fetch(this.baseUrl + '/loads/' + id + '/ctrl', {
      headers: {'Authorization': 'Bearer ' + this.authToken},
      method: 'put',
      body: JSON.stringify(loadCtrl),
    })
      .then((response) => {
        return response.json();
      });
  }

}

