var SharkPool = artifacts.require("./SharkPool.sol");

module.exports = function(deployer) {
    deployer.deploy(SharkPool);
};
