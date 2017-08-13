'use strict';

import Web3 from 'web3';
import bitcoineum_artifact from '../build/contracts/GaoPool.json'
import contract from 'truffle-contract'


//import BitcoineumMiner from './miner';

var provider = new Web3.providers.HttpProvider("http://localhost:8545");
const web3 = new Web3(provider);

var bitcoineum_adapter = contract(bitcoineum_artifact);
bitcoineum_adapter.setProvider(provider);

async function set_percentage() {
    var bte = await bitcoineum_adapter.deployed();
    var percentage = await bte.pool_percentage();
    console.log("Current pool percentage " + percentage);
    await bte.set_pool_percentage(5, {from: web3.eth.accounts[2]});
    console.log("Pool percentage set");
}

(async function() {
  await set_percentage();
})();
