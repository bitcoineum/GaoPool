'use strict';

import Web3 from 'web3';
import bitcoineum_artifact from '../../bitcoineum/build/contracts/Bitcoineum.json'
import contract from 'truffle-contract'


//import BitcoineumMiner from './miner';

var provider = new Web3.providers.HttpProvider("http://localhost:8545");
const web3 = new Web3(provider);

var bitcoineum_adapter = contract(bitcoineum_artifact);
bitcoineum_adapter.setProvider(provider);

async function balance() {
    var bte = await bitcoineum_adapter.deployed();
    console.log("Balance of " + web3.eth.accounts[2]);
    var quant = await bte.balanceOf(web3.eth.accounts[2]);
    console.log(quant + " " + quant / (10**8));
}

async function send() {
    var bte = await bitcoineum_adapter.deployed();
    await bte.transfer("0xsomeaddress", 50 * (10**8), {from: web3.eth.accounts[2], gas: 100000});
    console.log("sending: " + 50 * (10**8));
}

(async function() {
  await balance();
  await send();
})();
