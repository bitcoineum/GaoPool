'use strict';

import Web3 from 'web3';
import bitcoineum_artifact from '../build/contracts/GaoPool.json'
import contract from 'truffle-contract'

// Ropsten
var provider = new Web3.providers.HttpProvider("http://localhost:8545");
const web3 = new Web3(provider);

var bitcoineum_adapter = contract(bitcoineum_artifact);
bitcoineum_adapter.setProvider(provider);

async function setup() {
    var bte = await bitcoineum_adapter.deployed();
    console.log(bte.address);
    await bte.pool_set_mining_attempts(50, 50, {from: web3.eth.accounts[0], gas: 800000});
}

(async function() {
	console.log("setup");
	await setup();
})();
