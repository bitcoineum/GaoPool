'use strict';

var GaoPool = artifacts.require("./GaoPool.sol");
var GaoPoolMock = artifacts.require("./helpers/GaoPoolMock.sol");
const assertJump = require('zeppelin-solidity/test/helpers/assertJump');
var BitcoineumMock = artifacts.require('./helpers/BitcoineumMock.sol');

var BigNumber = require("bignumber.js");

// Helper functions

var snapshotId;
var bteInstance;

export function snapshotEvm() {
  return new Promise((resolve, reject) => {
    web3.currentProvider.sendAsync({
      jsonrpc: '2.0',
      method: 'evm_snapshot',
      id: Date.now(),
    }, (err, res) => {
      return err ? reject(err) : resolve(res)
    })
  })
}

export function revertEvm(id) {
  return new Promise((resolve, reject) => {
    web3.currentProvider.sendAsync({
      jsonrpc: '2.0',
      method: 'evm_revert',
      params: [id],
      id: Date.now(),
    }, (err, res) => {
      return err ? reject(err) : resolve(res)
    })
  })
}


function awaitEvent(event, handler) {
  return new Promise((resolve, reject) => {
    function wrappedHandler(...args) {
      Promise.resolve(handler(...args)).then(resolve).catch(reject);
    }
  
    event.watch(wrappedHandler);
  });
}

function minimumWei() {
	return web3.toWei('100', 'szabo')
}

function calcTotalWei(val) {
	  return new BigNumber(val).times(2016).toString(); 
}

async function setupMiner() {
	let bte = await BitcoineumMock.new();
	bteInstance = bte;
	let miner = await GaoPoolMock.new();
	await miner.setBitcoineumContractAddress(bte.address);
	return miner;
}


// Testing

contract('GaoPoolTest', function(accounts) {


  // Maxint in Ether
  var maxint = new BigNumber(2).toPower(256).minus(1);

  it("should have an owner for pool operations", async function() {
      let miner = await setupMiner();
      let owner = await miner.owner();
      assert.equal(owner, accounts[0]);
  });

  it("should allow the owner to set the pool percentage", async function() {
    let miner = await setupMiner();
    let percentage = await miner.poolPercentage();
    assert.equal(percentage.valueOf(), 0);
    await miner.poolSetPercentage(5);
    percentage = await miner.poolPercentage();
    assert.equal(percentage.valueOf(), 5);
  });

  it("should allow the owner to pause the pool", async function() {
    let miner = await setupMiner();
    let paused = await miner.isPaused();
    assert.isFalse(paused);
    await miner.poolSetPaused(true);
    paused = await miner.isPaused();
    assert.isTrue(paused);
  });

  it("should not allow mining on a paused pool", async function() {
    let miner = await setupMiner();
    await miner.poolSetPaused(true);
    try {
        await miner.sendTransaction({value: web3.toWei(1, 'ether'), from: accounts[0], gas: '125000'});
    } catch(error) {
        assertJump(error);
    }
  });


  // Starts with static element testing for constants and setup

   it("should correctly deploy a miner and an attached bte contract", async function() {
   	  let miner = await setupMiner();
   });
 
 
   it("should return the correct bte contract", async function() {
       let bte = await BitcoineumMock.new();
       let miner = await GaoPoolMock.new();
       let realMiner = await GaoPool.new();
       let addr = await realMiner.getBitcoineumContractAddress();
       assert.equal(addr, "0x73dd069c299a5d691e9836243bcaec9c8c1d8734");
       await miner.setBitcoineumContractAddress(bte.address);
       addr = await miner.getBitcoineumContractAddress();
       assert.equal(addr, bte.address);
   });
 
   it("should have correct default values", async function() {
   	  let miner = await setupMiner();
      let divisibleUnits = await miner.divisibleUnits();
      assert.equal(divisibleUnits, 10000000);
   	  let contractPeriod = await miner.contractPeriod();
   	  assert.equal(contractPeriod, 100);
   	  let blockCreationRate = await miner.blockCreationRate();
   	  assert.equal(blockCreationRate, 50);
   	  let name = await miner.poolName();
   	  assert.equal(name, "GaoPool Unlimited");
   });
 
 
 
  // Blatantly copied from Bitcoineum tests to ensure compat
  it("should calculate the block window based on the external ethereum block", async function() {
  	  let miner = await setupMiner();
  	  let res = await miner.externalToInternalBlockNumber(0);
  	  assert.equal(res.valueOf(), 0, "External block 0 should be window 0");
  	  res = await miner.externalToInternalBlockNumber(100);
  	  assert.equal(res.valueOf(), 2, "External block 100 should be window 2");
  	  for (var i=0; i < 50; i++) {
  	    assert.equal(Math.trunc((1000+i) / 50), 20);
  	    res = await miner.externalToInternalBlockNumber(1000+i);
  	    assert.equal(res.valueOf(), 20, "External block 1000 to 1049 should be window 20");
      }
  	  res = await miner.externalToInternalBlockNumber(maxint);
  	  assert.equal(res.toString(), maxint.dividedToIntegerBy(50).toString(), "External block maxint should be window maxint divided by 50");
  });

  it("should calculate the epoch based on the external ethereum block", async function() {
  	  let miner = await setupMiner();
  	  let res = await miner.calculateEpoch(0);
  	  assert.equal(res.valueOf(), 0, "External block 0 should be epoch 0");
  	  for (var i=0; i < 5000; i+=50) {
  	    res = await miner.calculateEpoch(5000+i)
  	    assert.equal(res.valueOf(), 1, "External block 5000 to 9999 should be epoch 1");
      }
  	    res = await miner.calculateEpoch(10000)
  	    assert.equal(res.valueOf(), 2, "External block 10000 should be epoch 2");
  	  res = await miner.calculateEpoch(maxint);
  	  assert.equal(res.toString(), maxint.dividedToIntegerBy(50).dividedToIntegerBy(100).toString(), "External block should be divided by 50 and then broken into 100 block contracts");
  });


  it("should calculate remaining blocks in an epoch correctly", async function() {

      let miner = await setupMiner();
      await miner.setBlock(0);
      let res = await miner.remainingEpochBlocks(0); 
      assert.equal(res.valueOf(), 100);
      for (var i=0; i<5000; i+=50) {
          await miner.setBlock(i);
          let res = await miner.remainingEpochBlocks(0)
          assert.equal(res.valueOf(), 100 - (i/50));
      }

      for (var i=20000; i<25000; i+=50) {
          await miner.setBlock(i);
          let res = await miner.remainingEpochBlocks(4)
          assert.equal(res.valueOf(), (25000 - i)/50);
      }

      await miner.setBlock(25001);
      res = await miner.remainingEpochBlocks(5);
      assert.equal(res.valueOf(), 100);

      res = await miner.remainingEpochBlocks(2);
      assert.equal(res.valueOf(), 0);

  });




   // This is the minimum block contribution amount multiplied by the total number of blocks in the contract period
   it("should calculate the minimum contribution based on the attached bte contract", async function() {
       let miner = await setupMiner();
       let contribution = await miner.calculateMinimumContribution();
       assert.equal(contribution.toString(), '1000000000');
   });
 
   it("should not allow me to add a contribution under the minimum to the pool", async function() {
       let miner = await setupMiner();
       try {
          await miner.sendTransaction({value: '100000000', from: accounts[0], gas: '125000'});
       } catch(error) {
           assertJump(error);
       }
   });
 
   it("should fail on default gas", async function() {
       let miner = await setupMiner();
       try {
         await miner.sendTransaction({value: '1000000000', from: accounts[0]});
       } catch(error) {
           assertJump(error);
       }
   });



   it("should allow me to add a contribution to the pool", async function() {
       let miner = await setupMiner();
       await miner.setBlock(5000); // 2nd epoch (1st block)
       let res = await miner.remainingEpochBlocks(5000); 
       await miner.sendTransaction({value: '1000000000', from: accounts[0], gas: '200000'});
       res = await miner.findContribution(accounts[0]);
       assert.equal(res[0].valueOf(), 1);
       assert.equal(res[1].toString(), '10000000');
       assert.equal(res[2].toString(), '1000000000');
       assert.equal(res[3].valueOf(), 0);
   });
 
   it("should return zeros when a contribution does not exist", async function() {
       let miner = await setupMiner();
       let res = await miner.findContribution(accounts[0]);
       assert.equal(res[0].toString(), '0');
       assert.equal(res[1].toString(), '0');
       assert.equal(res[2].toString(), '0');
       assert.equal(res[3].toString(), '0');
   });
 
   it("should allow multiple separate contributions to the pool", async function() {
       let miner = await setupMiner();
       await miner.sendTransaction({value: '1000000000', from: accounts[0], gas: '150000'});
       await miner.sendTransaction({value: '1000000000', from: accounts[1], gas: '150000'});
       await miner.sendTransaction({value: '1000000000', from: accounts[2], gas: '150000'});
       await miner.sendTransaction({value: '1000000000', from: accounts[3], gas: '150000'});
       await miner.sendTransaction({value: '1000000000', from: accounts[4], gas: '150000'});
       await miner.sendTransaction({value: '2000000000', from: accounts[5], gas: '150000'});
       await miner.sendTransaction({value: '3000000000', from: accounts[6], gas: '150000'});
       await miner.sendTransaction({value: '4000000000', from: accounts[7], gas: '150000'});
       await miner.sendTransaction({value: '10000000000', from: accounts[8], gas: '150000'});
 
       let res = await miner.findContribution(accounts[0]);
       assert.equal(res[1].toString(), '10000000');
       assert.equal(res[2].toString(), '1000000000');
 
       res = await miner.findContribution(accounts[1]);
       assert.equal(res[1].toString(), '10000000');
       assert.equal(res[2].toString(), '1000000000');

       res = await miner.findContribution(accounts[7]);
       assert.equal(res[1].toString(), '40000000');
       assert.equal(res[2].toString(), '4000000000');
   });

   it("should not allow multiple contributions during the same epoch for a single account", async function() {
       let miner = await setupMiner();
       await miner.sendTransaction({value: '1000000000', from: accounts[0], gas: '150000'});
       try {
           await miner.sendTransaction({value: '1000000000', from: accounts[0], gas: '150000'});
       } catch (error) {
           assertJump(error);
       }

   });
 
 
 
 it("should make no mining attempt when there are no users", async function() {
 	let startingBalance = await web3.eth.getBalance("0xdeaDDeADDEaDdeaDdEAddEADDEAdDeadDEADDEaD");
     let miner = await setupMiner();
     await miner.mine({gas: '300000'});
 	let balance = await web3.eth.getBalance("0xdeaDDeADDEaDdeaDdEAddEADDEAdDeadDEADDEaD");
 	assert.equal(balance.valueOf(), startingBalance.valueOf());
 });


 it("should make one mining attempt for single users value", async function() {
 	let startingBalance = await web3.eth.getBalance("0xdeaDDeADDEaDdeaDdEAddEADDEAdDeadDEADDEaD");
     let miner = await setupMiner();
     await miner.sendTransaction({value: '1000000000', from: accounts[0], gas: '150000'});
     await miner.mine({gas: '400000'});
 	let balance = await web3.eth.getBalance("0xdeaDDeADDEaDdeaDdEAddEADDEAdDeadDEADDEaD");
 	assert.equal(balance.minus(startingBalance).toString(), '10000000');
 	let res = await miner.getEpochRecord(0);
 	let minedBlocks = res[0];
 	let claimedBlocks = res[1];
 	let totalAttempt = res[2];
 	let actualAttempt = res[3];
 	let totalClaimed = res[4];
 	let adjustedUnit = res[5];
 	assert.equal(minedBlocks, 1);
 	assert.equal(claimedBlocks, 0);
 	assert.equal(totalAttempt.valueOf(), 1000000000);
 	assert.equal(actualAttempt.valueOf(), 10000000);
 	assert.equal(totalClaimed, 0);
 	assert.equal(adjustedUnit.valueOf(), 10000000);
 });
 
 it("should return false for checkMiningAttempt by default", async function() {
     let miner = await setupMiner();
     let attempt = await miner.checkMiningAttempt(0, miner.address); 
     assert.isFalse(attempt);
 });
 
 
 it("should return true for checkMiningAttempt following an attempt", async function() {
     let miner = await setupMiner();
     await miner.sendTransaction({value: '1000000000', from: accounts[0], gas: '150000'});
     await miner.mine({gas: '400000'});
     let attempt = await miner.checkMiningAttempt(0, miner.address); 
     assert.isTrue(attempt);
 });
 
 it("should not allow duplicate mining attempts for same block", async function() {
     let miner = await setupMiner();
     await miner.sendTransaction({value: '1000000000', from: accounts[0], gas: '150000'});
     await miner.mine({gas: '400000'});
     try {
         await miner.mine({gas: '400000'});
     } catch(error) {
         assertJump(error);
     }
 });
 
 it("should return false for checkWinning by default", async function() {
     let miner = await setupMiner();
     let attempt = await miner.checkWinning(0); 
     assert.isFalse(attempt);
 });
 
 it("should return true for checkWinning when we have won a mature block", async function() {
     let miner = await setupMiner();
     // This exhausts the minimum difficulty over 100 block period
     await miner.sendTransaction({value: '10000000000000000', from: accounts[0], gas: '150000'});
     await miner.mine({gas: '400000'});
 
     // Fast forward
 	await bteInstance.set_block(51);
 
 	let block = await bteInstance.current_external_block();
 	assert.equal(block.valueOf(), 51);
 
     let attempt = await miner.checkWinning(0, {gas: '100000'}); 
     assert.isTrue(attempt);
 });

 it("should allow claim on won mature block and have full block", async function() {
     let miner = await setupMiner();
     // This exhausts the minimum difficulty over 100 block period
     await miner.sendTransaction({value: '10000000000000000', from: accounts[0], gas: '150000'});
     await miner.mine({gas: '400000'});
 
     // Fast forward
 	await bteInstance.set_block(51);

    let balance = await miner.balanceOf(accounts[0]);
 	assert.equal(balance.valueOf(), 0);
 
     // Account is ignored, but maintains interface compat with BTE.
 	await miner.claim(0, accounts[0], {gas: '200000'});
 
 	// This should have distributed the entire BTE block to the sole miner in the pool	
 
    balance = await miner.balanceOf(accounts[0]);
 	assert.equal(balance.valueOf(), 100*(10**8));
 
 	let remainingPoolBalance = await bteInstance.balanceOf(miner.address);
 	assert.equal(remainingPoolBalance.valueOf(), 100*(10**8));
 
 });
 
 it("multiple pool miners should split reward", async function() {
     let miner = await setupMiner();
     // This exhausts the minimum difficulty over 100 block period
     await miner.sendTransaction({value: '10000000000000000', from: accounts[0], gas: '150000'});
     await miner.sendTransaction({value: '10000000000000000', from: accounts[1], gas: '150000'});
     await miner.sendTransaction({value: '10000000000000000', from: accounts[2], gas: '150000'});
     await miner.sendTransaction({value: '10000000000000000', from: accounts[3], gas: '150000'});
     await miner.sendTransaction({value: '10000000000000000', from: accounts[4], gas: '150000'});
     await miner.mine({gas: '400000'});
 
     // Fast forward
 	await bteInstance.set_block(51);
 
     // Account is ignored, but maintains interface compat with BTE.
 	await miner.claim(0, accounts[0], {gas: '800000'});
 
 	// This should have distributed the entire BTE block to the sole miner in the pool	
 
     let balance = await miner.balanceOf(accounts[0]);
 	assert.equal(balance.valueOf(), 20*(10**8));
 
 
     balance = await miner.balanceOf(accounts[1]);
 	assert.equal(balance.valueOf(), 20*(10**8));
 
     balance = await miner.balanceOf(accounts[2]);
 	assert.equal(balance.valueOf(), 20*(10**8));
 
     balance = await miner.balanceOf(accounts[3]);
 	assert.equal(balance.valueOf(), 20*(10**8));
 
     balance = await miner.balanceOf(accounts[4]);
 	assert.equal(balance.valueOf(), 20*(10**8));
 
 	let remainingPoolBalance = await bteInstance.balanceOf(miner.address);
 	assert.equal(remainingPoolBalance.valueOf(), 100 * (10**8));
 
 });
 
 
 it("multiple pool miners should split rounded reward on odd participants", async function() {
     let miner = await setupMiner();
     // This exhausts the minimum difficulty over 100 block period
     await miner.sendTransaction({value: '10000000000000000', from: accounts[0], gas: '150000'});
     await miner.sendTransaction({value: '10000000000000000', from: accounts[1], gas: '150000'});
     await miner.sendTransaction({value: '10000000000000000', from: accounts[2], gas: '150000'});
     await miner.sendTransaction({value: '10000000000000000', from: accounts[3], gas: '150000'});
     await miner.sendTransaction({value: '10000000000000000', from: accounts[4], gas: '150000'});
     await miner.sendTransaction({value: '10000000000000000', from: accounts[5], gas: '150000'});
     await miner.mine({gas: '400000'});
 
     // Fast forward
 	await bteInstance.set_block(51);
 
     // Account is ignored, but maintains interface compat with BTE.
 	await miner.claim(0, accounts[0], {gas: '300000'});
 
 	// This should have distributed the entire BTE block to the sole miner in the pool	
 
     let balance = await miner.balanceOf(accounts[0]);
 	assert.equal(balance.toString(), '1666666000');
 
     balance = await miner.balanceOf(accounts[1]);
 	assert.equal(balance.toString(), '1666666000');
 
     balance = await miner.balanceOf(accounts[2]);
 	assert.equal(balance.toString(), '1666666000');
 
     balance = await miner.balanceOf(accounts[3]);
 	assert.equal(balance.toString(), '1666666000');
 
     balance = await miner.balanceOf(accounts[4]);
 	assert.equal(balance.toString(), '1666666000');
 
     balance = await miner.balanceOf(accounts[5]);
 	assert.equal(balance.toString(), '1666666000');
 
     // Full balance is still sitting with contract
 	let remainingPoolBalance = await bteInstance.balanceOf(miner.address);
 	assert.equal(remainingPoolBalance.valueOf(), 100 * (10**8) );
 
 });
 
 it("multiple pool miners should split rounded reward on odd participants", async function() {
     let miner = await setupMiner();
     await miner.sendTransaction({value: '10000000000000000', from: accounts[0], gas: '150000'});
     await miner.sendTransaction({value: '30000000000000000', from: accounts[1], gas: '150000'});
     await miner.mine({gas: '400000'});
 
     // Fast forward
 	await bteInstance.set_block(51);
 
     // Account is ignored, but maintains interface compat with BTE.
 	await miner.claim(0, accounts[0], {gas: '300000'});
 
 	// This should have distributed the entire BTE block to the sole miner in the pool	
 	// The mining pool now owns the content
 
     let balance = await bteInstance.balanceOf(miner.address);
     assert.equal(balance.valueOf(), 100*(10**8));
 
     balance = await miner.balanceOf(accounts[0]);
     assert.equal(balance.valueOf(), 25*(10**8));
 
     balance = await miner.balanceOf(accounts[1]);
  	 assert.equal(balance.valueOf(), 75*(10**8));
 
  	// Now redeem
 
  	await miner.redeem({from: accounts[0]});

  	// You cannot redeem in GaoPool during the same Epoch, funds are locked until the contract period has expired.
 
  	balance = await bteInstance.balanceOf(accounts[0]);
  	assert.equal(balance.valueOf(), 0);

    balance = await miner.balanceOf(accounts[0]);
    assert.equal(balance.valueOf(), 25*(10**8));
 
 	let remainingPoolBalance = await bteInstance.balanceOf(miner.address);
 	assert.equal(remainingPoolBalance.valueOf(), 100*(10**8));
 
 });

 it("should mine 100 consecutive blocks", async function() {
    let miner = await setupMiner();
    // This exhausts the minimum difficulty over 100 block period
 
    await miner.sendTransaction({value: '10000000000000000', from: accounts[0], gas: '150000'});
    await miner.sendTransaction({value: '30000000000000000', from: accounts[1], gas: '150000'});
 
    for (var i=1; i<101; i++) {
        await miner.mine({gas: '400000'});
 
        // Fast forward
      await bteInstance.set_block((50*i)+1);
      await miner.setBlock((50*i)+1);
 
      // Check the attempt
 
      let attempt = await miner.checkMiningAttempt(i-1, miner.address); 
      assert.isTrue(attempt);
 
      // Definitely won, check anyway
      attempt = await miner.checkWinning(i-1, {gas: '100000'}); 
      assert.isTrue(attempt);
 
      // Account is ignored, but maintains interface compat with BTE.
      await miner.claim(i-1, accounts[0], {gas: '300000'});
 
      let balance = await miner.balanceOf(accounts[0]);
      assert.equal(balance.valueOf(), (i*25)*(10**8));
 
      balance = await miner.balanceOf(accounts[1]);
      assert.equal(balance.valueOf(), (i*75)*(10**8));
    }
 
    try {
        await miner.mine({gas: '400000'});
    } catch(error) {
        assertJump(error);
    }
 
 
 });

 it("should allow forward balance adjustments at any time", async function() {
     let miner = await setupMiner();
     // This exhausts the minimum difficulty over 100 block period
 
     await miner.sendTransaction({value: '10000000000000000', from: accounts[0], gas: '150000'});
     await miner.sendTransaction({value: '10000000000000000', from: accounts[1], gas: '150000'});
 
     for (var i=1; i<51; i++) {
         await miner.mine({gas: '400000'});
 
         // Fast forward
 	    await bteInstance.set_block((50*i)+1);
 	    await miner.setBlock((50*i)+1);
 
 	    // Check the attempt
 
         let attempt = await miner.checkMiningAttempt(i-1, miner.address); 
         assert.isTrue(attempt);
 
         // Definitely won, check anyway
         attempt = await miner.checkWinning(i-1, {gas: '100000'}); 
         assert.isTrue(attempt);
 
         // Account is ignored, but maintains interface compat with BTE.
 	    await miner.claim(i-1, accounts[0], {gas: '800000'});
 
 	    // This should have distributed the entire BTE block to the sole miner in the pool	
 
         let balance = await miner.balanceOf(accounts[0]);
  	    assert.equal(balance.valueOf(), (i*50)*(10**8));
 
         balance = await miner.balanceOf(accounts[1]);
  	    assert.equal(balance.valueOf(), (i*50)*(10**8));
 
      }
 
      // Check sub account state at the 50% mark
 
 
      let res = await miner.findContribution(accounts[0]);
      assert.equal(res[1].toString(), '100000000000000'); 
      assert.equal(res[2].toString(), '10000000000000000'); 
  });



 it("should allow us to add large numbers of users unique accounts to the pool", async function() {
     let miner = await setupMiner();
 
     for (var i=0; i<300; i++) {
         await miner.sendTransaction({value: '10000000000000000', from: accounts[i], gas: '150000'});
     }
 
     // Adding another miner will fail
 
     try {
         await miner.sendTransaction({value: '10000000000000000', from: accounts[290], gas: '150000'});
     } catch(error) {
         assertJump(error);
     }
 
     // I should now exhaust the entire pool over 100 blocks
  
     for (var i=1; i<101; i++) {
         await miner.mine({gas: '600000'});
 
         // Fast forward
 	    await bteInstance.set_block((50*i)+1);
 	    await miner.setBlock((50*i)+1);
 
 	    // Check the attempt
 
         let attempt = await miner.checkMiningAttempt(i-1, miner.address); 
         assert.isTrue(attempt);
 
         // Definitely won, check anyway
         attempt = await miner.checkWinning(i-1, {gas: '100000'}); 
         assert.isTrue(attempt);
 
         // Account is ignored, but maintains interface compat with BTE.
 	    await miner.claim(i-1, accounts[0], {gas: '3000000'});
     }
 
 });
 
 it("should distribute a percentage of the pool on redemption", async function() {
     let miner = await setupMiner();
     await miner.poolSetPercentage(5);
     // This exhausts the minimum difficulty over 100 block period
     await miner.sendTransaction({value: '10000000000000000', from: accounts[1], gas: '150000'});
     await miner.mine({gas: '400000'});
 
     // Fast forward
 	await bteInstance.set_block(51);
 
     // Account is ignored, but maintains interface compat with BTE.
 	await miner.claim(0, accounts[1], {gas: '300000'});
 
 	// This should have distributed the entire BTE block to the sole miner in the pool	
 
     let balance = await miner.balanceOf(accounts[1]);
 	assert.equal(balance.valueOf(), 100*(10**8));

    // Redemption will fail while in the same epoch

    try {
        await miner.redeem({from: accounts[1]});
    } catch(error) {
        assertJump(error)
    }

    // Let's fast forward
    await miner.setBlock(20000);

    // Now it will succeed
    await miner.redeem({from: accounts[1]});
 
 	balance = await miner.balanceOf(accounts[1]);
 	assert.equal(balance.valueOf(), 0);
 
     // winning account distribution
 	balance = await bteInstance.balanceOf(accounts[1]);
 	assert.equal(balance.valueOf(), 95*(10**8));
 
     // Pool percentage distribution
 	balance = await bteInstance.balanceOf(accounts[0]);
 	assert.equal(balance.valueOf(), 5*(10**8));
 
 });

});

