'use strict';
require("babel-polyfill");

import Web3 from 'web3';
import bitcoineum_adapter from '../build/contracts/SharkPool.json'
//import EthereumBlocks from 'ethereum-blocks';
//

import BitcoineumMiner from './miner';
 
const web3 = new Web3(new Web3.providers.HttpProvider("http://localhost:8545"));


var test = contract(bitcoineum_adapter);
test.setProvider(web3);
await test.deployed(); 

var miner = new BitcoineumMiner(web3,
                                web3.eth.accounts[0],
                                console.log,
                                bitcoineum_adapter);
                                
miner.toggleDebug();
