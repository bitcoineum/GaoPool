'use strict';

import Web3 from 'web3';
import bitcoineum_artifact from '../build/contracts/GaoPool.json'
import contract from 'truffle-contract'


//import BitcoineumMiner from './miner';

var provider = new Web3.providers.HttpProvider("http://localhost:8545");
const web3 = new Web3(provider);

var bitcoineum_adapter = contract(bitcoineum_artifact);
bitcoineum_adapter.setProvider(provider);

async function claim(blocknum) {
    var bte = await bitcoineum_adapter.deployed();
    await bte.claim(blocknum, web3.eth.accounts[6], {from: web3.eth.accounts[3], gas: 800000, gasPrice: web3.toWei('30', 'gwei')});
}

(async function() {
  await claim(84831);
})();
