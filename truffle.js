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
      network_id: "*" // Match any network id
    //  from: '0xccb0f2346e0c610f1738c439f884f530fc8591f7'
//      from: '0xfeed62e22dfb2c16a8da2cc581df5e0eee2d5a4d'
    }
  }
};
