'use strict';

var GaoPool = artifacts.require("./GaoPool.sol");
var GaoPoolMock = artifacts.require("./helpers/GaoPoolMock.sol");
const assertJump = require('zeppelin-solidity/test/helpers/assertJump');
var BitcoineumMock = artifacts.require('./helpers/BitcoineumMock.sol');

var BigNumber = require("bignumber.js");

// Helper functions

var snapshot_id;
var bte_instance;

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

async function setup_miner() {
	let bte = await BitcoineumMock.new();
	bte_instance = bte;
	let miner = await GaoPoolMock.new();
	await miner.set_bitcoineum_contract_address(bte.address);
	return miner;
}


// Testing

contract('GaoPoolTest', function(accounts) {


  // Maxint in Ether
  var maxint = new BigNumber(2).toPower(256).minus(1);

  it("should have an owner for pool operations", async function() {
      let miner = await setup_miner();
      let owner = await miner.owner();
      assert.equal(owner, accounts[0]);
  });

  it("should allow the owner to set the pool percentage", async function() {
    let miner = await setup_miner();
    let percentage = await miner.pool_percentage();
    assert.equal(percentage.valueOf(), 0);
    await miner.set_pool_percentage(5);
    percentage = await miner.pool_percentage();
    assert.equal(percentage.valueOf(), 5);
  });


  // Starts with static element testing for constants and setup

//   it("should correctly deploy a miner and an attached bte contract", async function() {
//   	  let miner = await setup_miner();
//   });
// 
// 
//   it("should return the correct bte contract", async function() {
//       let bte = await BitcoineumMock.new();
//       let miner = await GaoPoolMock.new();
//       let real_miner = await GaoPool.new();
//       let addr = await real_miner.get_bitcoineum_contract_address();
//       assert.equal(addr, "0x73dd069c299a5d691e9836243bcaec9c8c1d8734");
//       await miner.set_bitcoineum_contract_address(bte.address);
//       addr = await miner.get_bitcoineum_contract_address();
//       assert.equal(addr, bte.address);
//   });
// 
//   it("should have correct default values", async function() {
//   	  let miner = await setup_miner();
//   	  let max_users = await miner.max_users();
//   	  assert.equal(max_users, 100);
//   	  let contract_period = await miner.contract_period();
//   	  assert.equal(contract_period, 100);
//   	  let mined_blocks = await miner.mined_blocks();
//   	  assert.equal(mined_blocks, 1);
//   	  let claimed_blocks = await miner.claimed_blocks();
//   	  assert.equal(claimed_blocks, 1);
//   	  let blockCreationRate = await miner.blockCreationRate();
//   	  assert.equal(blockCreationRate, 50);
//   	  let name = await miner.pool_name();
//   	  assert.equal(name, "GaoPool 100");
//   });
// 
//   it("Should not let us call internal allocate_slot", async function() {
//   	  let miner = await setup_miner();
//   	  let caught = false;
//   	  try {
//   	  	    await miner.allocate_slot(accounts[0]);
// 		} catch(error) {
// 			caught = true;
// 		}	
// 	  assert.isTrue(caught);
//   });
// 
//   it("Should not allocate slots by default", async function() {
//   	  let miner = await setup_miner();
//   	  for (var i=0; i<100; i++) {
//   	      await miner.do_allocate_slot(accounts[0])
//       }
//       let total_users = await miner.total_users();
//       assert.equal(total_users.valueOf(), 100);
//       let available_slots = await miner.available_slots();
//       assert.equal(available_slots.valueOf(), 0);
//   });
// 
//   it("Should throw if there are no available slots and max users is reached", async function() {
//       let miner = await setup_miner();
//       await miner.set_total_users(100);
// 
//       try {
//           await miner.do_allocate_slot(accounts[0]);
//       } catch(error) {
//           return assertJump(error);
//       }
//   })
// 
// 
//   it("Should calculate available slots correctly", async function() {
//       let miner = await setup_miner();
//       let available_slots = await miner.available_slots();
//       assert.equal(available_slots.valueOf(), 100);
//       for (var i=1; i<101; i++) {
//           await miner.do_allocate_slot(accounts[0]);
//           let available_slots = await miner.available_slots();
//           assert.equal(available_slots.valueOf(), 100-i);
//       }
//       available_slots = await miner.available_slots();
//       assert.equal(available_slots.valueOf(), 0);
//   });
// 
// 
//   // Blatantly copied from Bitcoineum tests to ensure compat
//   it("should calculate the block window based on the external ethereum block", async function() {
//   	  let miner = await setup_miner();
//   	  let res = await miner.external_to_internal_block_number(0);
//   	  assert.equal(res.valueOf(), 0, "External block 0 should be window 0");
//   	  res = await miner.external_to_internal_block_number(100);
//   	  assert.equal(res.valueOf(), 2, "External block 100 should be window 2");
//   	  for (var i=0; i < 50; i++) {
//   	    assert.equal(Math.trunc((1000+i) / 50), 20);
//   	    res = await miner.external_to_internal_block_number(1000+i);
//   	    assert.equal(res.valueOf(), 20, "External block 1000 to 1049 should be window 20");
//       }
//   	  res = await miner.external_to_internal_block_number(maxint);
//   	  assert.equal(res.toString(), maxint.dividedToIntegerBy(50).toString(), "External block maxint should be window maxint divided by 50");
//   });
// 
// 
//   // This is the minimum block contribution amount multiplied by the total number of blocks in the contract period
//   it("should calculate the minimum contribution based on the attached bte contract", async function() {
//       let miner = await setup_miner();
//       let contribution = await miner.calculate_minimum_contribution();
//       assert.equal(contribution.toString(), '1000000000');
//   });
// 
//   it("should not allow me to add a contribution under the minimum to the pool", async function() {
//       let miner = await setup_miner();
//       try {
//          await miner.sendTransaction({value: '100000000', from: accounts[0], gas: '125000'});
//       } catch(error) {
//           assertJump(error);
//       }
//   });
// 
//   it("should fail on default gas", async function() {
//       let miner = await setup_miner();
//       try {
//         await miner.sendTransaction({value: '1000000000', from: accounts[0]});
//       } catch(error) {
//           assertJump(error);
//       }
//   });
// 
// 
// 
//   it("should allow me to add a contribution to the pool", async function() {
//       let miner = await setup_miner();
//       await miner.sendTransaction({value: '1000000000', from: accounts[0], gas: '125000'});
//       let res = await miner.find_contribution(accounts[0]);
//       assert.equal(res[2].toString(), '10000000');
//       assert.equal(res[3].toString(), '1000000000');
//   });
// 
//   it("should return zeros when a contribution does not exist", async function() {
//       let miner = await setup_miner();
//       let res = await miner.find_contribution(accounts[0]);
//       assert.equal(res[0].toString(), '0');
//       assert.equal(res[1].toString(), '0');
//       assert.equal(res[2].toString(), '0');
//       assert.equal(res[3].toString(), '0');
//   });
// 
//   it("should allow multiple contributions to the pool", async function() {
//       let miner = await setup_miner();
//       await miner.sendTransaction({value: '1000000000', from: accounts[0], gas: '125000'});
//       await miner.sendTransaction({value: '1000000000', from: accounts[0], gas: '125000'});
//       await miner.sendTransaction({value: '1000000000', from: accounts[0], gas: '125000'});
//       await miner.sendTransaction({value: '1000000000', from: accounts[0], gas: '125000'});
//       await miner.sendTransaction({value: '1000000000', from: accounts[0], gas: '125000'});
//       await miner.sendTransaction({value: '2000000000', from: accounts[1], gas: '125000'});
//       await miner.sendTransaction({value: '3000000000', from: accounts[2], gas: '125000'});
//       await miner.sendTransaction({value: '4000000000', from: accounts[3], gas: '125000'});
//       await miner.sendTransaction({value: '10000000000', from: accounts[4], gas: '125000'});
// 
//       let res = await miner.find_contribution(accounts[0]);
//       assert.equal(res[2].toString(), '50000000');
//       assert.equal(res[3].toString(), '5000000000');
// 
//       res = await miner.find_contribution(accounts[1]);
//       assert.equal(res[2].toString(), '20000000');
// 
//       res = await miner.find_contribution(accounts[2]);
//       assert.equal(res[2].toString(), '30000000');
// 
//       res = await miner.find_contribution(accounts[3]);
//       assert.equal(res[2].toString(), '40000000');
// 
//       res = await miner.find_contribution(accounts[4]);
//       assert.equal(res[2].toString(), '100000000');
// 
//   });
// 
// 
// it("should increment users on unique contribution", async function() {
//       let miner = await setup_miner();
//       await miner.sendTransaction({value: '1000000000', from: accounts[0], gas: '125000'});
//       let res = await miner.total_users();
//       assert.equal(res.valueOf(), 1);
//       
//       await miner.sendTransaction({value: '1000000000', from: accounts[0], gas: '125000'});
//       res = await miner.total_users();
//       assert.equal(res.valueOf(), 1);
// 
//       await miner.sendTransaction({value: '1000000000', from: accounts[1], gas: '125000'});
//       res = await miner.total_users();
//       assert.equal(res.valueOf(), 2);
// 
//       await miner.sendTransaction({value: '1000000000', from: accounts[2], gas: '125000'});
//       res = await miner.total_users();
//       assert.equal(res.valueOf(), 3);
//   });
// 
// 
// it("should make no mining attempt when there are no users", async function() {
// 	let starting_balance = await web3.eth.getBalance("0xdeaDDeADDEaDdeaDdEAddEADDEAdDeadDEADDEaD");
//     let miner = await setup_miner();
//     await miner.mine({gas: '300000'});
// 	let balance = await web3.eth.getBalance("0xdeaDDeADDEaDdeaDdEAddEADDEAdDeadDEADDEaD");
// 	assert.equal(balance.valueOf(), starting_balance.valueOf());
// });
// 
// it("should make one mining attempt for single users value", async function() {
// 	let starting_balance = await web3.eth.getBalance("0xdeaDDeADDEaDdeaDdEAddEADDEAdDeadDEADDEaD");
//     let miner = await setup_miner();
//     await miner.sendTransaction({value: '1000000000', from: accounts[0], gas: '125000'});
//     await miner.mine({gas: '400000'});
// 	let balance = await web3.eth.getBalance("0xdeaDDeADDEaDdeaDdEAddEADDEAdDeadDEADDEaD");
// 	assert.equal(balance.minus(starting_balance).toString(), '10000000');
// 	let total_users = await miner.total_users();
// 	assert.equal(total_users, 1);
// 	let mined_blocks = await miner.mined_blocks();
// 	assert.equal(mined_blocks, 2);
// });
// 
// it("should return false for checkMiningAttempt by default", async function() {
//     let miner = await setup_miner();
//     let attempt = await miner.checkMiningAttempt(0, miner.address); 
//     assert.isFalse(attempt);
// });
// 
// 
// it("should return true for checkMiningAttempt following an attempt", async function() {
//     let miner = await setup_miner();
//     await miner.sendTransaction({value: '1000000000', from: accounts[0], gas: '125000'});
//     await miner.mine({gas: '400000'});
//     let attempt = await miner.checkMiningAttempt(0, miner.address); 
//     assert.isTrue(attempt);
// });
// 
// it("should not allow duplicate mining attempts for same block", async function() {
//     let miner = await setup_miner();
//     await miner.sendTransaction({value: '1000000000', from: accounts[0], gas: '125000'});
//     await miner.mine({gas: '400000'});
//     try {
//         await miner.mine({gas: '400000'});
//     } catch(error) {
//         assertJump(error);
//     }
// });
// 
// it("should return false for checkWinning by default", async function() {
//     let miner = await setup_miner();
//     let attempt = await miner.checkWinning(0); 
//     assert.isFalse(attempt);
// });
// 
// it("should return true for checkWinning when we have won a mature block", async function() {
//     let miner = await setup_miner();
//     // This exhausts the minimum difficulty over 100 block period
//     await miner.sendTransaction({value: '10000000000000000', from: accounts[0], gas: '125000'});
//                                          
//     await miner.mine({gas: '400000'});
// 
//     // Fast forward
// 	await bte_instance.set_block(51);
// 
// 	let block = await bte_instance.current_external_block();
// 	assert.equal(block.valueOf(), 51);
// 
//     let attempt = await miner.checkWinning(0, {gas: '100000'}); 
//     assert.isTrue(attempt);
// });
// 
// it("should allow claim on won mature block and have full block", async function() {
//     let miner = await setup_miner();
//     // This exhausts the minimum difficulty over 100 block period
//     await miner.sendTransaction({value: '10000000000000000', from: accounts[0], gas: '125000'});
//     await miner.mine({gas: '400000'});
// 
//     // Fast forward
// 	await bte_instance.set_block(51);
// 
//     // Account is ignored, but maintains interface compat with BTE.
// 	await miner.claim(0, accounts[0], {gas: '800000'});
// 
// 	// This should have distributed the entire BTE block to the sole miner in the pool	
// 
//     let balance = await miner.balanceOf(accounts[0]);
// 	assert.equal(balance.valueOf(), 100*(10**8));
// 
// 	let remaining_pool_balance = await bte_instance.balanceOf(miner.address);
// 	assert.equal(remaining_pool_balance.valueOf(), 100*(10**8));
// 
// });
// 
// it("multiple pool miners should split reward", async function() {
//     let miner = await setup_miner();
//     // This exhausts the minimum difficulty over 100 block period
//     await miner.sendTransaction({value: '10000000000000000', from: accounts[0], gas: '125000'});
//     await miner.sendTransaction({value: '10000000000000000', from: accounts[1], gas: '125000'});
//     await miner.sendTransaction({value: '10000000000000000', from: accounts[2], gas: '125000'});
//     await miner.sendTransaction({value: '10000000000000000', from: accounts[3], gas: '125000'});
//     await miner.sendTransaction({value: '10000000000000000', from: accounts[4], gas: '125000'});
//     await miner.mine({gas: '400000'});
// 
//     // Fast forward
// 	await bte_instance.set_block(51);
// 
//     // Account is ignored, but maintains interface compat with BTE.
// 	await miner.claim(0, accounts[0], {gas: '800000'});
// 
// 	// This should have distributed the entire BTE block to the sole miner in the pool	
// 
//     let balance = await miner.balanceOf(accounts[0]);
// 	assert.equal(balance.valueOf(), 20*(10**8));
// 
// 
//     balance = await miner.balanceOf(accounts[1]);
// 	assert.equal(balance.valueOf(), 20*(10**8));
// 
//     balance = await miner.balanceOf(accounts[2]);
// 	assert.equal(balance.valueOf(), 20*(10**8));
// 
//     balance = await miner.balanceOf(accounts[3]);
// 	assert.equal(balance.valueOf(), 20*(10**8));
// 
//     balance = await miner.balanceOf(accounts[4]);
// 	assert.equal(balance.valueOf(), 20*(10**8));
// 
// 	let remaining_pool_balance = await bte_instance.balanceOf(miner.address);
// 	assert.equal(remaining_pool_balance.valueOf(), 100 * (10**8));
// 
// });
// 
// 
// it("multiple pool miners should split rounded reward on odd participants", async function() {
//     let miner = await setup_miner();
//     // This exhausts the minimum difficulty over 100 block period
//     await miner.sendTransaction({value: '10000000000000000', from: accounts[0], gas: '125000'});
//     await miner.sendTransaction({value: '10000000000000000', from: accounts[1], gas: '125000'});
//     await miner.sendTransaction({value: '10000000000000000', from: accounts[2], gas: '125000'});
//     await miner.sendTransaction({value: '10000000000000000', from: accounts[3], gas: '125000'});
//     await miner.sendTransaction({value: '10000000000000000', from: accounts[4], gas: '125000'});
//     await miner.sendTransaction({value: '10000000000000000', from: accounts[5], gas: '125000'});
//     await miner.mine({gas: '400000'});
// 
//     // Fast forward
// 	await bte_instance.set_block(51);
// 
//     // Account is ignored, but maintains interface compat with BTE.
// 	await miner.claim(0, accounts[0], {gas: '300000'});
// 
// 	// This should have distributed the entire BTE block to the sole miner in the pool	
// 
//     let balance = await miner.balanceOf(accounts[0]);
// 	assert.equal(balance.toString(), '1666666000');
// 
//     balance = await miner.balanceOf(accounts[1]);
// 	assert.equal(balance.toString(), '1666666000');
// 
//     balance = await miner.balanceOf(accounts[2]);
// 	assert.equal(balance.toString(), '1666666000');
// 
//     balance = await miner.balanceOf(accounts[3]);
// 	assert.equal(balance.toString(), '1666666000');
// 
//     balance = await miner.balanceOf(accounts[4]);
// 	assert.equal(balance.toString(), '1666666000');
// 
//     balance = await miner.balanceOf(accounts[5]);
// 	assert.equal(balance.toString(), '1666666000');
// 
//     // Full balance is still sitting with contract
// 	let remaining_pool_balance = await bte_instance.balanceOf(miner.address);
// 	assert.equal(remaining_pool_balance.valueOf(), 100 * (10**8) );
// 
// });
// 
// it("multiple pool miners should split rounded reward on odd participants", async function() {
//     let miner = await setup_miner();
//     // This exhausts the minimum difficulty over 100 block period
//     await miner.sendTransaction({value: '10000000000000000', from: accounts[0], gas: '125000'});
//     await miner.sendTransaction({value: '30000000000000000', from: accounts[1], gas: '125000'});
//     await miner.mine({gas: '400000'});
// 
//     // Fast forward
// 	await bte_instance.set_block(51);
// 
//     // Account is ignored, but maintains interface compat with BTE.
// 	await miner.claim(0, accounts[0], {gas: '300000'});
// 
// 	// This should have distributed the entire BTE block to the sole miner in the pool	
// 	// The mining pool now owns the content
// 
//     let balance = await bte_instance.balanceOf(miner.address);
//     assert.equal(balance.valueOf(), 100*(10**8));
// 
//     balance = await miner.balanceOf(accounts[0]);
//     assert.equal(balance.valueOf(), 25*(10**8));
// 
//     balance = await miner.balanceOf(accounts[1]);
//  	assert.equal(balance.valueOf(), 75*(10**8));
// 
//  	// Now redeem
// 
//  	await miner.redeem({from: accounts[0]});
// 
//  	balance = await bte_instance.balanceOf(accounts[0]);
//  	assert.equal(balance.valueOf(), 25*(10**8));
//  	
//  	balance = await miner.balanceOf(accounts[0]);
//  	assert.equal(balance.valueOf(), 0);
// 
// 	let remaining_pool_balance = await bte_instance.balanceOf(miner.address);
// 	assert.equal(remaining_pool_balance.valueOf(), 75*(10**8));
// 
// });
// 
// it("should mine 100 consecutive blocks", async function() {
//    let miner = await setup_miner();
//    // This exhausts the minimum difficulty over 100 block period
// 
//    await miner.sendTransaction({value: '10000000000000000', from: accounts[0], gas: '125000'});
//    await miner.sendTransaction({value: '30000000000000000', from: accounts[1], gas: '125000'});
// 
//    for (var i=1; i<101; i++) {
//        await miner.mine({gas: '400000'});
// 
//        // Fast forward
//      await bte_instance.set_block((50*i)+1);
//      await miner.set_block((50*i)+1);
// 
//      // Check the attempt
// 
//      let attempt = await miner.checkMiningAttempt(i-1, miner.address); 
//      assert.isTrue(attempt);
// 
//      // Definitely won, check anyway
//      attempt = await miner.checkWinning(i-1, {gas: '100000'}); 
//      assert.isTrue(attempt);
// 
//      // Account is ignored, but maintains interface compat with BTE.
//      await miner.claim(i-1, accounts[0], {gas: '600000'});
// 
//      let balance = await miner.balanceOf(accounts[0]);
//      assert.equal(balance.valueOf(), (i*25)*(10**8));
// 
//      balance = await miner.balanceOf(accounts[1]);
//      assert.equal(balance.valueOf(), (i*75)*(10**8));
//    }
// 
//    try {
//        await miner.mine({gas: '400000'});
//    } catch(error) {
//        assertJump(error);
//    }
// 
// 
// });
// 
// it("should allow forward balance adjustments at any time", async function() {
//     let miner = await setup_miner();
//     // This exhausts the minimum difficulty over 100 block period
// 
//     await miner.sendTransaction({value: '10000000000000000', from: accounts[0], gas: '125000'});
//     await miner.sendTransaction({value: '10000000000000000', from: accounts[1], gas: '125000'});
// 
//     for (var i=1; i<51; i++) {
//         await miner.mine({gas: '400000'});
// 
//         // Fast forward
// 	    await bte_instance.set_block((50*i)+1);
// 	    await miner.set_block((50*i)+1);
// 
// 	    // Check the attempt
// 
//         let attempt = await miner.checkMiningAttempt(i-1, miner.address); 
//         assert.isTrue(attempt);
// 
//         // Definitely won, check anyway
//         attempt = await miner.checkWinning(i-1, {gas: '100000'}); 
//         assert.isTrue(attempt);
// 
//         // Account is ignored, but maintains interface compat with BTE.
// 	    await miner.claim(i-1, accounts[0], {gas: '800000'});
// 
// 	    // This should have distributed the entire BTE block to the sole miner in the pool	
// 
//         let balance = await miner.balanceOf(accounts[0]);
//  	    assert.equal(balance.valueOf(), (i*50)*(10**8));
// 
//         balance = await miner.balanceOf(accounts[1]);
//  	    assert.equal(balance.valueOf(), (i*50)*(10**8));
// 
//      }
// 
//      // Check sub account state at the 50% mark
// 
// 
//      let res = await miner.find_contribution(accounts[0]);
//      assert.equal(res[2].toString(), '100000000000000'); 
//      assert.equal(res[4].toString(), '5000000000000000'); 
// 
//      // Increase the bet
// 
//      await miner.sendTransaction({value: '10000000000000000', from: accounts[0], gas: '125000'});
// 
//      // Proportional contribution should now change
// 
//      res = await miner.find_contribution(accounts[0]);
//      assert.equal(res[2].toString(), '150000000000000');
//      assert.equal(res[3].toString(), '15000000000000000');
//    
//      // Secondary account should be unaffected
// 
//      res = await miner.find_contribution(accounts[1]);
//      assert.equal(res[2].toString(), '100000000000000'); 
//      assert.equal(res[4].toString(), '5000000000000000'); 
// });
// 
// 
// 
// it("should allow us to add up to max_users unique accounts to the pool", async function() {
//     let miner = await setup_miner();
// 
//     for (var i=0; i<100; i++) {
//         await miner.sendTransaction({value: '10000000000000000', from: accounts[i], gas: '125000'});
//     }
// 
//     let available_slots = await miner.available_slots();
//     assert.equal(available_slots.valueOf(), 0);
// 
//     // Adding another miner will fail
// 
//     try {
//         await miner.sendTransaction({value: '10000000000000000', from: accounts[290], gas: '125000'});
//     } catch(error) {
//         assertJump(error);
//     }
// 
//     // I should now exhaust the entire pool over 100 blocks
//  
//     for (var i=1; i<101; i++) {
//         await miner.mine({gas: '600000'});
// 
//         // Fast forward
// 	    await bte_instance.set_block((50*i)+1);
// 	    await miner.set_block((50*i)+1);
// 
// 	    // Check the attempt
// 
//         let attempt = await miner.checkMiningAttempt(i-1, miner.address); 
//         assert.isTrue(attempt);
// 
//         // Definitely won, check anyway
//         attempt = await miner.checkWinning(i-1, {gas: '100000'}); 
//         assert.isTrue(attempt);
// 
//         // Account is ignored, but maintains interface compat with BTE.
// 	    await miner.claim(i-1, accounts[0], {gas: '3000000'});
//     }
// 
//     let mined_blocks = await miner.mined_blocks();
//     assert.equal(mined_blocks.valueOf(), 101);
// 
//     available_slots = await miner.available_slots();
//     assert.equal(available_slots.valueOf(), 0);
// 
//     let total_users = await miner.total_users();
//     assert.equal(total_users, 100);
// 
//     await miner.mine({gas: '600000'});
// 
// 
//     available_slots = await miner.available_slots();
//     assert.equal(available_slots.valueOf(), 10);
//    
// });
// 
// it("should distribute a percentage of the pool on redemption", async function() {
//     let miner = await setup_miner();
//     await miner.set_pool_percentage(5);
//     // This exhausts the minimum difficulty over 100 block period
//     await miner.sendTransaction({value: '10000000000000000', from: accounts[1], gas: '125000'});
//     await miner.mine({gas: '400000'});
// 
//     // Fast forward
// 	await bte_instance.set_block(51);
// 
//     // Account is ignored, but maintains interface compat with BTE.
// 	await miner.claim(0, accounts[1], {gas: '800000'});
// 
// 	// This should have distributed the entire BTE block to the sole miner in the pool	
// 
//     let balance = await miner.balanceOf(accounts[1]);
// 	assert.equal(balance.valueOf(), 100*(10**8));
// 
// 	await miner.redeem({from: accounts[1]});
// 
// 	balance = await miner.balanceOf(accounts[1]);
// 	assert.equal(balance.valueOf(), 0);
// 
//     // winning account distribution
// 	balance = await bte_instance.balanceOf(accounts[1]);
// 	assert.equal(balance.valueOf(), 95*(10**8));
// 
//     // Pool percentage distribution
// 	balance = await bte_instance.balanceOf(accounts[0]);
// 	assert.equal(balance.valueOf(), 5*(10**8));
// 
// });

});

