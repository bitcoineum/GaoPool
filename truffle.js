require('babel-register');
require('babel-polyfill');

var provider;
var HDWalletProvider = require('truffle-hdwallet-provider');
var mnemonic = '[REDACTED]';


module.exports = {
  networks: {
    development: {
      host: "localhost",
      port: 8646,
      network_id: "*"
    },
    ropsten: {
      host: "localhost",
      port: 8545,
      gas: 7000000,
      before_timeout: 1000000, 
      test_timeout: 1000000, 
      network_id: 3,
      from: '0x0018Df6C139A2B4b4a61d6e44b7411c7e17bB680'
    } 
  }
};
