/*
if (typeof window === 'undefined') {
  const noop = () => {}
  global.window = {}
  window.addEventListener = noop
}
*/
"use strict";
// @ts-check
Object.defineProperty(exports, "__esModule", { value: true });

const api_1 = require("@polkadot/api");
const types_1 = require("@joystream/types");
const BN = require('bn.js');
const getStatusUpdate = require('./getstatus')
const express = require('express')
const sleepSeconds = require('./sleep')
const app = express()

var STATUS = {}

async function main () {
  //const provider = new api_1.WsProvider('wss://staging-reckless.joystream.org/reckless/rpc/');
  //const provider = new api_1.WsProvider('wss://staging-lts.joystream.org/staging/rpc/');
  const provider = new api_1.WsProvider('ws://127.0.0.1:9944');
  await types_1.registerJoystreamTypes();
  await api_1.ApiPromise.create(provider);


    STATUS = await getStatusUpdate()
    await sleepSeconds(6)
  
}

main()

app.get('/', function (req, res) {
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(STATUS))
})

const server = app.listen(8081, function () {
  const host = server.address().address
  const port = server.address().port
  console.log('Status server listening at http://%s:%s', host, port)
})
