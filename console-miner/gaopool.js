'use strict';

import Web3 from 'web3';
import bitcoineum_adapter from '../build/contracts/GaoPool.json'
import contract from 'truffle-contract'

import BitcoineumMiner from './miner';
import BitcoineumBlock from './miner';

//import BitcoineumMiner from './miner';

var provider = new Web3.providers.HttpProvider("http://localhost:8545");
const web3 = new Web3(provider);

var miner = new BitcoineumMiner(provider,
                                web3.eth.accounts[2],
                                console.log,
                                bitcoineum_adapter);
                       
miner.bootstrap();

