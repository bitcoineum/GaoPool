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
    await miner.pool_set_percentage(5);
    percentage = await miner.pool_percentage();
    assert.equal(percentage.valueOf(), 5);
  });

  it("should allow the owner to pause the pool", async function() {
    let miner = await setup_miner();
    let paused = await miner.isPaused();
    assert.isFalse(paused);
    await miner.pool_set_paused(true);
    paused = await miner.isPaused();
    assert.isTrue(paused);
  });

  it("should not allow mining on a paused pool", async function() {
    let miner = await setup_miner();
    await miner.pool_set_paused(true);
    try {
        await miner.sendTransaction({value: web3.toWei(1, 'ether'), from: accounts[0], gas: '125000'});
    } catch(error) {
        assertJump(error);
    }
  });


//  // Starts with static element testing for constants and setup
//
   it("should correctly deploy a miner and an attached bte contract", async function() {
   	  let miner = await setup_miner();
   });
 
 
   it("should return the correct bte contract", async function() {
       let bte = await BitcoineumMock.new();
       let miner = await GaoPoolMock.new();
       let real_miner = await GaoPool.new();
       let addr = await real_miner.get_bitcoineum_contract_address();
       assert.equal(addr, "0x73dd069c299a5d691e9836243bcaec9c8c1d8734");
       await miner.set_bitcoineum_contract_address(bte.address);
       addr = await miner.get_bitcoineum_contract_address();
       assert.equal(addr, bte.address);
   });
 
   it("should have correct default values", async function() {
   	  let miner = await setup_miner();
      let divisible_units = await miner.divisible_units();
      assert.equal(divisible_units.valueOf(), 1000000000);
   	  let contract_period = await miner.contract_period();
   	  assert.equal(contract_period.valueOf(), 100);
   	  let blockCreationRate = await miner.blockCreationRate();
   	  assert.equal(blockCreationRate.valueOf(), 50);
   	  let name = await miner.pool_name();
   	  assert.equal(name, "GaoPool Unlimited");
   });
 
 
 
  // Blatantly copied from Bitcoineum tests to ensure compat
  it("should calculate the block window based on the external ethereum block", async function() {
  	  let miner = await setup_miner();
  	  let res = await miner.external_to_internal_block_number(0);
  	  assert.equal(res.valueOf(), 0, "External block 0 should be window 0");
  	  res = await miner.external_to_internal_block_number(100);
  	  assert.equal(res.valueOf(), 2, "External block 100 should be window 2");
  	  for (var i=0; i < 50; i++) {
  	    assert.equal(Math.trunc((1000+i) / 50), 20);
  	    res = await miner.external_to_internal_block_number(1000+i);
  	    assert.equal(res.valueOf(), 20, "External block 1000 to 1049 should be window 20");
      }
  	  res = await miner.external_to_internal_block_number(maxint);
  	  assert.equal(res.toString(), maxint.dividedToIntegerBy(50).toString(), "External block maxint should be window maxint divided by 50");
  });

  it("should calculate the epoch based on the total number of mining attempts", async function() {
  	  let miner = await setup_miner();
  	  let res = await miner.calculate_epoch(0);
  	  assert.equal(res.valueOf(), 0, "External block 0 should be epoch 0");
  	  for (var i=0; i < 1000; i+=100) {
  	    res = await miner.calculate_epoch(i)
  	    assert.equal(res.valueOf(), i/100, "Mining attempts are divided by contract period");
      }
  	    res = await miner.calculate_epoch(10000)
  	    assert.equal(res.valueOf(), 100, "Mining attempt 10000 should be epoch 100");
  	  res = await miner.calculate_epoch(maxint);
  	  assert.equal(res.toString(), maxint.dividedToIntegerBy(100).toString(), "Mining attempts should be divided by 100");
  });


  it("should calculate remaining blocks in an epoch correctly", async function() {

      let miner = await setup_miner();
      await miner.set_mine_attempts(0);
      let res = await miner.remaining_epoch_blocks(); 
      assert.equal(res.valueOf(), 100);
      for (var i=0; i<100; i+=1) {
          await miner.set_mine_attempts(i);
          let res = await miner.remaining_epoch_blocks()
          assert.equal(res.valueOf(), 100-i);
      }

      for (var i=500; i<600; i+=1) {
          await miner.set_mine_attempts(i);
          let res = await miner.remaining_epoch_blocks()
          assert.equal(res.valueOf(), 100-(i-500));
      }


      await miner.set_mine_attempts(25001);
      res = await miner.remaining_epoch_blocks();
      assert.equal(res.valueOf(), 99);
  });




   // This is the minimum block contribution amount multiplied by the total number of blocks in the contract period
   it("should calculate the minimum contribution based on the attached bte contract", async function() {
       let miner = await setup_miner();
       let contribution = await miner.calculate_minimum_contribution();
       assert.equal(contribution.toString(), '1000000000');
   });
 
   it("should not allow me to add a contribution under the minimum to the pool", async function() {
       let miner = await setup_miner();
       try {
          await miner.sendTransaction({value: '100000000', from: accounts[0], gas: '125000'});
       } catch(error) {
           assertJump(error);
       }
   });
 
   it("should fail on default gas", async function() {
       let miner = await setup_miner();
       try {
         await miner.sendTransaction({value: '1000000000', from: accounts[0]});
       } catch(error) {
           assertJump(error);
       }
   });



   it("should allow me to add a contribution to the pool", async function() {
       let miner = await setup_miner();
       await miner.set_mine_attempts(100); // 2nd epoch (1st block)
       await miner.sendTransaction({value: '1000000000', from: accounts[0], gas: '200000'});
       var res = await miner.find_contribution(accounts[0]);
       assert.equal(res[0].valueOf(), 1);
       assert.equal(res[1].toString(), '10000000');
       assert.equal(res[2].toString(), '0');
       assert.equal(res[3].valueOf(), 1000000000);
   });

   it("should allow me to add a contribution to the pool via the deposit interface", async function() {
       let miner = await setup_miner();
       await miner.set_mine_attempts(100); // 2nd epoch (1st block)
       await miner.deposit(accounts[0], {value: '1000000000', from: accounts[0], gas: '200000'}); 
       var res = await miner.find_contribution(accounts[0]);
       assert.equal(res[0].valueOf(), 1);
       assert.equal(res[1].toString(), '10000000');
       assert.equal(res[2].toString(), '0');
       assert.equal(res[3].valueOf(), 1000000000);
   });

 
   it("should return zeros when a contribution does not exist", async function() {
       let miner = await setup_miner();
       let res = await miner.find_contribution(accounts[0]);
       assert.equal(res[0].toString(), '0');
       assert.equal(res[1].toString(), '0');
       assert.equal(res[2].toString(), '0');
       assert.equal(res[3].toString(), '0');
   });
 
   it("should allow multiple separate contributions to the pool", async function() {
       let miner = await setup_miner();
       await miner.sendTransaction({value: '1000000000', from: accounts[0], gas: '150000'});
       await miner.sendTransaction({value: '1000000000', from: accounts[1], gas: '150000'});
       await miner.sendTransaction({value: '1000000000', from: accounts[2], gas: '150000'});
       await miner.sendTransaction({value: '1000000000', from: accounts[3], gas: '150000'});
       await miner.sendTransaction({value: '1000000000', from: accounts[4], gas: '150000'});
       await miner.sendTransaction({value: '2000000000', from: accounts[5], gas: '150000'});
       await miner.sendTransaction({value: '3000000000', from: accounts[6], gas: '150000'});
       await miner.sendTransaction({value: '4000000000', from: accounts[7], gas: '150000'});
       await miner.sendTransaction({value: '10000000000', from: accounts[8], gas: '150000'});
 
       let res = await miner.find_contribution(accounts[0]);
       assert.equal(res[1].toString(), '10000000');
       assert.equal(res[2].toString(), '0');
 
       res = await miner.find_contribution(accounts[1]);
       assert.equal(res[1].toString(), '10000000');
       assert.equal(res[2].toString(), '0');

       res = await miner.find_contribution(accounts[7]);
       assert.equal(res[1].toString(), '40000000');
       assert.equal(res[2].toString(), '0');
   });

   it("must allocate balances and partial attempts correctly if multiple attempts are made in the same epoch", async function() {
       let miner = await setup_miner();
       await miner.sendTransaction({value: '1000000000', from: accounts[0], gas: '200000'});
       let res = await miner.find_contribution(accounts[0]);
       assert.equal(res[2].toString(), '0');
       assert.equal(res[3].toString(), '1000000000');

       await miner.sendTransaction({value: '1000000000', from: accounts[0], gas: '200000'});

       // This should result in a contribution balance adjustment
       res = await miner.find_contribution(accounts[0]);
       assert.equal(res[2].toString(), '0');
       assert.equal(res[3].toString(), '2000000000');
   });

   it("should accurately reflect balance across epochs", async function() {
       let miner = await setup_miner();
       await miner.set_mine_attempts(99);
       await miner.sendTransaction({value: '10000000000000000', from: accounts[0], gas: '200000'});
       let res = await miner.find_contribution(accounts[0]);
       assert.equal(res[2].toString(), '0');
       assert.equal(res[3].toString(), '10000000000000000');
       assert.equal(res[4].valueOf(), 0); 

       await miner.mine({gas: '400000'});

       await bte_instance.set_block(51);
       await miner.set_block(51);
       await miner.claim(0, accounts[0], {gas: '300000'});
       // Epoch Boundary
       res = await miner.find_contribution(accounts[0]);
       assert.equal(res[0].valueOf(), 0);
       assert.equal(res[2].toString(), '10000000000000000');
       assert.equal(res[3].valueOf(), 0);
       assert.equal(res[4].valueOf(), 100*(10**8)); 
       
       await miner.sendTransaction({value: '10000000000000000', from: accounts[0], gas: '200000'});

       // This should result in a contribution balance adjustment
       res = await miner.find_contribution(accounts[0]);
       assert.equal(res[0].valueOf(), 1);
       assert.equal(res[2].valueOf(), 0);
       assert.equal(res[3].valueOf(), 10000000000000000);
   });

 
  it("should mine 100 consecutive blocks", async function() {
     let miner = await setup_miner();
     // This exhausts the minimum difficulty over 100 block period
  
     await miner.deposit(accounts[0], {value: '10000000000000000', from: accounts[0], gas: '200000'});
  
     for (var i=1; i<101; i++) {
         await miner.mine({gas: '400000'});
  
           // Fast forward
         await bte_instance.set_block((50*i)+1);
         await miner.set_block((50*i)+1);

         //let total_attempts = await miner.total_mine_attempts();
         //console.log(total_attempts);
         let res = await miner.find_contribution(accounts[0]);
         assert.equal(res[0].valueOf(), 0);
         assert.equal(res[1].valueOf(), 100000000000000);
         assert.equal(res[2].valueOf(), 100000000000000 * i);
         assert.equal(res[3].valueOf(), 10000000000000000 - (100000000000000 * i));
         assert.equal(res[4].valueOf(), ((i-1)*100)*(10**8));

         let epoch_record = await miner.get_epoch_record(0);

         assert.equal(epoch_record[0].valueOf(), i);
         assert.equal(epoch_record[1].valueOf(), i-1);
         assert.equal(epoch_record[2].valueOf(), 100000000000000 * i);
         assert.equal(epoch_record[3].valueOf(), (100 * (i-1)) * (10**8));
         assert.equal(epoch_record[4].valueOf(), 100000000000000);

  
         // Account is ignored, but maintains interface compat with BTE.
         await miner.claim(i-1, accounts[0], {gas: '300000'});
  
         let balance = await miner.balanceOf(accounts[0]);
         assert.equal(balance.valueOf(), (i*100)*(10**8));
     }

     var initial_balance = await miner.balanceOf(accounts[0]);

     // Should also mine the next 100 correctly

     await miner.sendTransaction({value: '10000000000000000', from: accounts[0], gas: '200000'});
     for (var i=101; i<201; i++) {
         await miner.mine({gas: '400000'});
  
           // Fast forward
         await bte_instance.set_block((50*i)+1);
         await miner.set_block((50*i)+1);

         let total_attempts = await miner.total_mine_attempts();
         
         let res = await miner.find_contribution(accounts[0]);
         assert.equal(res[0].valueOf(), 1);
         assert.equal(res[1].valueOf(), 100000000000000);
         assert.equal(res[2].valueOf(), 100000000000000 * (i-100));
         assert.equal(res[3].valueOf(), 10000000000000000 - (100000000000000 * (i-100)));

         let epoch_record = await miner.get_epoch_record(1);

         assert.equal(epoch_record[0].valueOf(), (i-100));
         assert.equal(epoch_record[1].valueOf(), (i-100-1));
         assert.equal(epoch_record[2].valueOf(), 100000000000000 * (i-100));
         assert.equal(epoch_record[3].valueOf(), (100 * ((i-100)-1)) * (10**8));
         assert.equal(epoch_record[4].valueOf(), 100000000000000);
  
         // Account is ignored, but maintains interface compat with BTE.
         await miner.claim(i-1, accounts[0], {gas: '300000'});
  
         let balance = await miner.balanceOf(accounts[0]);
         assert.equal(balance.valueOf() - initial_balance, ((i-100)*100)*(10**8));
     }

  
  });

 it("should make no mining attempt when there are no users", async function() {
 	let starting_balance = await web3.eth.getBalance("0xdeaDDeADDEaDdeaDdEAddEADDEAdDeadDEADDEaD");
     let miner = await setup_miner();
     await miner.mine({gas: '300000'});
 	let balance = await web3.eth.getBalance("0xdeaDDeADDEaDdeaDdEAddEADDEAdDeadDEADDEaD");
 	assert.equal(balance.valueOf(), starting_balance.valueOf());
 });


 it("should make one mining attempt for single users value", async function() {
 	let starting_balance = await web3.eth.getBalance("0xdeaDDeADDEaDdeaDdEAddEADDEAdDeadDEADDEaD");
     let miner = await setup_miner();
     await miner.sendTransaction({value: '1000000000', from: accounts[0], gas: '150000'});
     await miner.mine({gas: '400000'});
 	let balance = await web3.eth.getBalance("0xdeaDDeADDEaDdeaDdEAddEADDEAdDeadDEADDEaD");
 	assert.equal(balance.minus(starting_balance).toString(), '10000000');
 	let res = await miner.get_epoch_record(0);
 	let mined_blocks = res[0];
 	let claimed_blocks = res[1];
 	let actual_attempt = res[2];
 	let total_claimed = res[3];
 	let adjusted_unit = res[4];
 	assert.equal(mined_blocks, 1);
 	assert.equal(claimed_blocks, 0);
 	assert.equal(actual_attempt.valueOf(), 10000000);
 	assert.equal(total_claimed, 0);
 	assert.equal(adjusted_unit.valueOf(), 10000000);
 });
 
 it("should return false for checkMiningAttempt by default", async function() {
     let miner = await setup_miner();
     let attempt = await miner.checkMiningAttempt(0, miner.address); 
     assert.isFalse(attempt);
 });
 
 
 it("should return true for checkMiningAttempt following an attempt", async function() {
     let miner = await setup_miner();
     await miner.sendTransaction({value: '1000000000', from: accounts[0], gas: '150000'});
     await miner.mine({gas: '400000'});
     let attempt = await miner.checkMiningAttempt(0, miner.address); 
     assert.isTrue(attempt);
 });
 
 it("should not allow duplicate mining attempts for same block", async function() {
     let miner = await setup_miner();
     await miner.sendTransaction({value: '1000000000', from: accounts[0], gas: '150000'});
     await miner.mine({gas: '400000'});
     try {
         await miner.mine({gas: '400000'});
     } catch(error) {
         assertJump(error);
     }
 });
 
 it("should return false for checkWinning by default", async function() {
     let miner = await setup_miner();
     let attempt = await miner.checkWinning(0); 
     assert.isFalse(attempt);
 });

 it("should return true for checkWinning when we have won a mature block", async function() {
     let miner = await setup_miner();
     // This exhausts the minimum difficulty over 100 block period
     await miner.sendTransaction({value: '10000000000000000', from: accounts[0], gas: '200000'});
     await miner.mine({gas: '400000'});
 
     // Fast forward
 	await bte_instance.set_block(51);
 
 	let block = await bte_instance.current_external_block();
 	assert.equal(block.valueOf(), 51);
 
     let attempt = await miner.checkWinning(0, {gas: '100000'}); 
     assert.isTrue(attempt);
 });

 it("should allow claim on won mature block and have full block", async function() {
     let miner = await setup_miner();
     // This exhausts the minimum difficulty over 100 block period
     await miner.sendTransaction({value: '10000000000000000', from: accounts[0], gas: '200000'});
     await miner.mine({gas: '400000'});
 
     // Fast forward
 	await bte_instance.set_block(51);

    let balance = await miner.balanceOf(accounts[0]);
 	assert.equal(balance.valueOf(), 0);
 
     // Account is ignored, but maintains interface compat with BTE.
 	await miner.claim(0, accounts[0], {gas: '400000'});
 
 	// This should have distributed the entire BTE block to the sole miner in the pool	
 
    balance = await miner.balanceOf(accounts[0]);
 	assert.equal(balance.valueOf(), 100*(10**8));
 
 	let remaining_pool_balance = await bte_instance.balanceOf(miner.address);
 	assert.equal(remaining_pool_balance.valueOf(), 100*(10**8));
 
 });

  it("multiple pool miners should split reward", async function() {
      let miner = await setup_miner();
      // This exhausts the minimum difficulty over 100 block period
      await miner.sendTransaction({value: '10000000000000000', from: accounts[0], gas: '150000'});
      await miner.sendTransaction({value: '10000000000000000', from: accounts[1], gas: '150000'});
      await miner.sendTransaction({value: '10000000000000000', from: accounts[2], gas: '150000'});
      await miner.sendTransaction({value: '10000000000000000', from: accounts[3], gas: '150000'});
      await miner.sendTransaction({value: '10000000000000000', from: accounts[4], gas: '150000'});
      await miner.mine({gas: '400000'});
  
      // Fast forward
  	await bte_instance.set_block(51);
  
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
  
  	let remaining_pool_balance = await bte_instance.balanceOf(miner.address);
  	assert.equal(remaining_pool_balance.valueOf(), 100 * (10**8));
  
  });


 it("multiple pool miners should split rounded reward on odd participants", async function() {
     let miner = await setup_miner();
     // This exhausts the minimum difficulty over 100 block period
     await miner.sendTransaction({value: '10000000000000000', from: accounts[0], gas: '150000'});
     await miner.sendTransaction({value: '10000000000000000', from: accounts[1], gas: '150000'});
     await miner.sendTransaction({value: '10000000000000000', from: accounts[2], gas: '150000'});
     await miner.sendTransaction({value: '10000000000000000', from: accounts[3], gas: '150000'});
     await miner.sendTransaction({value: '10000000000000000', from: accounts[4], gas: '150000'});
     await miner.sendTransaction({value: '10000000000000000', from: accounts[5], gas: '150000'});
     await miner.mine({gas: '400000'});
 
     // Fast forward
 	await bte_instance.set_block(51);
 
     // Account is ignored, but maintains interface compat with BTE.
 	await miner.claim(0, accounts[0], {gas: '300000'});
 
 	// This should have distributed the entire BTE block to the sole miner in the pool	
 
     let balance = await miner.balanceOf(accounts[0]);
 	assert.equal(balance.toString(), '1666666660');
 
     balance = await miner.balanceOf(accounts[1]);
 	assert.equal(balance.toString(), '1666666660');
 
     balance = await miner.balanceOf(accounts[2]);
 	assert.equal(balance.toString(), '1666666660');
 
     balance = await miner.balanceOf(accounts[3]);
 	assert.equal(balance.toString(), '1666666660');
 
     balance = await miner.balanceOf(accounts[4]);
 	assert.equal(balance.toString(), '1666666660');
 
     balance = await miner.balanceOf(accounts[5]);
 	assert.equal(balance.toString(), '1666666660');
 
     // Full balance is still sitting with contract
 	let remaining_pool_balance = await bte_instance.balanceOf(miner.address);
 	assert.equal(remaining_pool_balance.valueOf(), 100 * (10**8) );
 
 });

 it("multiple pool miners should split rounded reward on odd participants", async function() {
     let miner = await setup_miner();
     // Miner needs to be at end of window 
     await miner.set_mine_attempts(99);
     
     await miner.sendTransaction({value: '10000000000000000', from: accounts[0], gas: '200000'});
     await miner.sendTransaction({value: '30000000000000000', from: accounts[1], gas: '200000'});
     await miner.mine({gas: '400000'});
 
     // Fast forward
 	await bte_instance.set_block(51);
    // await miner.set_mine_attempts(201);
 
     // Account is ignored, but maintains interface compat with BTE.
 	await miner.claim(0, accounts[0], {gas: '300000'});
 
 	// This should have distributed the entire BTE block to the sole miner in the pool	
 	// The mining pool now owns the content


     let balance = await bte_instance.balanceOf(miner.address);
     assert.equal(balance.valueOf(), 100*(10**8));
 
     balance = await miner.balanceOf(accounts[0]);
     assert.equal(balance.valueOf(), 25*(10**8));
 
     balance = await miner.balanceOf(accounts[1]);
  	 assert.equal(balance.valueOf(), 75*(10**8));
 
    // Fast forward the contract mining attempt window
  	// Now redeem, redemption is done via a 0 ether transaction to the pool
 
    await miner.sendTransaction({value: '0', from: accounts[0], gas: '500000'});

  	balance = await bte_instance.balanceOf(accounts[0]);
  	assert.equal(balance.valueOf(), 25*(10**8));

    balance = await miner.balanceOf(accounts[0]);
    assert.equal(balance.valueOf(), 0);
 
 	let remaining_pool_balance = await bte_instance.balanceOf(miner.address);
 	assert.equal(remaining_pool_balance.valueOf(), 75*(10**8));
 
 });

 it("should mine 100 consecutive blocks", async function() {
    let miner = await setup_miner();
    // This exhausts the minimum difficulty over 100 block period
 
    await miner.sendTransaction({value: '10000000000000000', from: accounts[0], gas: '200000'});
    await miner.sendTransaction({value: '30000000000000000', from: accounts[1], gas: '200000'});
 
    for (var i=1; i<101; i++) {
        await miner.mine({gas: '400000'});
 
        // Fast forward
      await bte_instance.set_block((50*i)+1);
      await miner.set_block((50*i)+1);
 
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

 it("should project accurate balance approximation", async function() {
     let miner = await setup_miner();
     // This exhausts the minimum difficulty over 100 block period
 
     await miner.sendTransaction({value: '10000000000000000', from: accounts[0], gas: '150000'});
     await miner.sendTransaction({value: '10000000000000000', from: accounts[1], gas: '150000'});
 
     for (var i=1; i<51; i++) {
         await miner.mine({gas: '400000'});
 
         // Fast forward
 	    await bte_instance.set_block((50*i)+1);
 	    await miner.set_block((50*i)+1);
 
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
 
 
      let res = await miner.find_contribution(accounts[0]);
      assert.equal(res[1].toString(), '100000000000000'); 
      assert.equal(res[2].toString(), '5000000000000000'); 
  });


// Have to split this into a separate set of tests because of trpc annoyances
// it("should allow us to add large numbers of users unique accounts to the pool", async function() {
//     let miner = await setup_miner();
// 
//     for (var i=0; i<300; i++) {
//         await miner.sendTransaction({value: '10000000000000000', from: accounts[i], gas: '200000'});
//     }
// 
//     // Adding another miner will fail
// 
//     try {
//         await miner.sendTransaction({value: '10000000000000000', from: accounts[290], gas: '200000'});
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
// });

 it("should fail to redeem within the user's active epoch", async function() {
     let miner = await setup_miner();
     // This exhausts the minimum difficulty over 100 block period
     await miner.sendTransaction({value: '10000000000000000', from: accounts[1], gas: '150000'});
       let res = await miner.find_contribution(accounts[1]);
       assert.equal(res[2].toString(), '0');
       assert.equal(res[3].toString(), '10000000000000000');
       assert.equal(res[4].valueOf(), 0); 

    // Let's immediate try and redeem (our balance is 0

    await miner.sendTransaction({value: '0', from: accounts[1], gas: '500000'});

    // Everything should be the same, balance unaffected
    res = await miner.find_contribution(accounts[1]);
    assert.equal(res[2].toString(), '0');
    assert.equal(res[3].toString(), '10000000000000000');
    assert.equal(res[4].valueOf(), 0); 

    await miner.mine({gas: '400000'});

    
    // Let's redeem and check the balance again, there hasn't been a claim
    
    await miner.sendTransaction({value: '0', from: accounts[1], gas: '500000'});
    
    res = await miner.find_contribution(accounts[1]);
    assert.equal(res[2].toString(), '100000000000000');
    assert.equal(res[3].valueOf(), 10000000000000000 - 100000000000000);
    assert.equal(res[4].valueOf(), 0); 

 
     // Fast forward
 	await bte_instance.set_block(51);
     // Account is ignored, but maintains interface compat with BTE.
 	await miner.claim(0, accounts[0], {gas: '300000'});

    // Let's claim again

    await miner.sendTransaction({value: '0', from: accounts[1], gas: '500000'});
    
    res = await miner.find_contribution(accounts[1]);
    assert.equal(res[2].toString(), 0);
    assert.equal(res[3].valueOf(), 10000000000000000 - 100000000000000);
    assert.equal(res[4].valueOf(), 0); 

 
     let balance = await miner.balanceOf(accounts[1]);
 	 assert.equal(balance.valueOf(), 0);

    // Redemption will fail while in the same epoch

 });

it("should let us change the ace bank contract", async function() {
    let miner = await setup_miner();
    let new_address = "0xda3528903bc9d53b1ca608129fa5227ab1ad053b";
    await miner.pool_set_ace_bank(new_address);

    let ace_contract = await miner.ace_contract_addr();

    assert.equal(new_address, ace_contract);
});

it("should let us set max bet", async function() {
     let miner = await setup_miner();
     await miner.pool_set_max_bet(web3.toWei('1', 'ether'));
     // This exhausts the minimum difficulty over 100 block period
    try {
        await miner.sendTransaction({value: '10000000000000000', from: accounts[1], gas: '150000'});
    } catch(error) {
        assertJump(error)
    }
 });


 
 it("should distribute a percentage the pool eth to ACE Bank", async function() {
     let miner = await setup_miner();
     let initial_balance = await web3.eth.getBalance("0x31d26dc9c64b355b561e8dcd2ba354b93d15eedd");
     await miner.pool_set_percentage(25, {gas: '150000'});
     // This exhausts the minimum difficulty over 100 block period
     await miner.set_mine_attempts(99);
     await miner.sendTransaction({value: '10000000000000000', from: accounts[1], gas: '200000'});
     await miner.mine({gas: '400000'});

     var res = await miner.find_contribution(accounts[1]);
     assert.equal(res[0].valueOf(), 0);
     assert.equal(res[1].toString(), '7500000000000000');
     assert.equal(res[2].toString(), '7500000000000000');
     assert.equal(res[3].valueOf(), 0);

     let new_balance = await web3.eth.getBalance("0x31d26dc9c64b355b561e8dcd2ba354b93d15eedd");
     new_balance -= initial_balance;
     assert.equal(new_balance.toString(), '2500000000000000');
 
 });

   it("should not allow multiple bet redemptions", async function() {
     let miner = await setup_miner();
     await miner.set_mine_attempts(99);
     await miner.sendTransaction({value: '10000000000000000', from: accounts[1], gas: '150000'});
     await miner.mine({gas: '400000'});
 
     // Fast forward
 	await bte_instance.set_block(51);
 
     // Account is ignored, but maintains interface compat with BTE.
 	await miner.claim(0, accounts[1], {gas: '300000'});
 
 	// This should have distributed the entire BTE block to the sole miner in the pool	
 
     let balance = await miner.balanceOf(accounts[1]);
 	assert.equal(balance.valueOf(), 100*(10**8));

    // This should result in a redemption
    await miner.sendTransaction({value: '0', from: accounts[1], gas: '500000'});

 	balance = await miner.balanceOf(accounts[1]);
 	assert.equal(balance.valueOf(), 0);

 	balance = await bte_instance.balanceOf(accounts[1]);
 	assert.equal(balance.valueOf(), 100*(10**8));

    // Second redemption via function should fail
    try {
        await miner.sendTransaction({value: '0', from: accounts[1], gas: '500000'});
    }catch (error) {
        assertJump(error);
    }
 
 	balance = await miner.balanceOf(accounts[1]);
 	assert.equal(balance.valueOf(), 0);
 
 });

  it("should mine 100 consecutive blocks with continual redemption", async function() {
     let miner = await setup_miner();
     // Do test from 2nd epoch
     // await miner.set_mine_attempts(100);
     
     await miner.sendTransaction({value: '10000000000000000',
                                 from: accounts[0],
                                 gas: '200000'});

     var accrued_loss = new BigNumber(0);

  
     for (var i=1; i<101; i++) {
         await miner.mine({gas: '500000'});
  
           // Fast forward
         await bte_instance.set_block((50*i)+1);
         await miner.set_block((50*i)+1);


         //let total_attempts = await miner.total_mine_attempts();
         //console.log(total_attempts);
         let res = await miner.find_contribution(accounts[0]);
         assert.equal(res[0].valueOf(), 0);
         assert.equal(res[1].valueOf(), 100000000000000);
         // Contribution for epoch is always the same
         // since I am redeeming every attempt
         assert.equal(res[2].valueOf(), 100000000000000);
         assert.equal(res[3].valueOf(), 10000000000000000 - (100000000000000 * i));

         let epoch_record = await miner.get_epoch_record(0);

         assert.equal(epoch_record[0].valueOf(), i);
         assert.equal(epoch_record[1].valueOf(), i-1);
         assert.equal(epoch_record[2].valueOf(), 100000000000000 * i);
         assert.equal(epoch_record[3].valueOf(), (100 * (i-1)) * (10**8));
         assert.equal(epoch_record[4].valueOf(), 100000000000000);

  
        // // Account is ignored, but maintains interface compat with BTE.
        await miner.claim(i-1, accounts[0], {gas: '400000'});
        // At this point we have accrued almost 100
        // This is because of rounding error with fixed point math
        let balance = await miner.balanceOf(accounts[0]);
        assert.isAbove(balance.valueOf(), 99.999*(10**8));
        accrued_loss = accrued_loss.plus(new BigNumber(100*(10**8)).minus(balance));

        //console.log(balance.valueOf());
        // Claim thus far
        await miner.sendTransaction({value: '0',
                                 from: accounts[0],
                                 gas: '200000'});

        // + Spurious redemption
        await miner.sendTransaction({value: '0',
                                 from: accounts[0],
                                 gas: '200000'});


        let contract_balance = await web3.eth.getBalance(miner.address);
        assert.equal(contract_balance.valueOf(),
                     10000000000000000 - (100000000000000 * i));


        //  miner balance should always be 0
        //  since we are redeeming every single attempt
        balance = await miner.balanceOf(accounts[0]);
        assert.equal(balance.valueOf(), 0);
     }

     assert.isAbove(0.0003, (accrued_loss.valueOf() / (10**8)));

     let contract_balance = await web3.eth.getBalance(miner.address);
     assert.equal(contract_balance.valueOf(), 0);

  });

 it("should mine 100 consecutive blocks with continual redemption and continual mining adjustments", async function() {
    let miner = await setup_miner();
    let contract_balance = await web3.eth.getBalance(miner.address);
    assert.equal(contract_balance.valueOf(), 0);
    
    await miner.sendTransaction({value: '10000000000000000',
                                from: accounts[0],
                                gas: '200000'});

    var accrued_loss = new BigNumber(0);

 
    for (var i=1; i<101; i++) {
        await miner.mine({gas: '500000'});
 
          // Fast forward
        await bte_instance.set_block((50*i)+1);
        await miner.set_block((50*i)+1);

       await miner.claim(i-1, accounts[0], {gas: '400000'});

       // Claim thus far
       await miner.sendTransaction({value: '0',
                                from: accounts[0],
                                gas: '1000000'});


       let balance = await miner.balanceOf(accounts[0]);
       assert.equal(balance.valueOf(), 0);

       await miner.sendTransaction({value: '10000000000000000',
                                   from: accounts[0],
                                   gas: '1000000'});
      
    }

    //console.log("Accrued loss " + accrued_loss.valueOf());
    //assert.isAbove(0.0003, (accrued_loss.valueOf() / (10**8)));

    // This is rounding error slippage
    contract_balance = await web3.eth.getBalance(miner.address);
    assert.isBelow(contract_balance.valueOf(), 10000000000004000);

 });


  it("should mine 100 consecutive blocks and accurately adjust balance across epochs", async function() {
     let miner = await setup_miner();
     // Do test from 2nd epoch
     // await miner.set_mine_attempts(100);
     
     let contract_balance = await web3.eth.getBalance(miner.address);
     assert.equal(contract_balance.valueOf(), 0);
     
     await miner.sendTransaction({value: '10000000000000000',
                                 from: accounts[0],
                                 gas: '200000'});

     for (var i=1; i<101; i++) {
         await miner.mine({gas: '500000'});
  
           // Fast forward
         await bte_instance.set_block((50*i)+1);
         await miner.set_block((50*i)+1);
         await miner.claim(i-1, accounts[0], {gas: '400000'});
     }

      // At this point we should have a 100 blocks worth of accrued bte

      let balance = await miner.balanceOf(accounts[0]);
      assert.equal(balance.valueOf(), new BigNumber(100*(100*(10**8))).valueOf());

	  // If I try to mine now it should error out, funds are exhausted


	  try {
         await miner.mine({gas: '500000'});
	  } catch (error) {
	  	  assertJump(error);
	  }

      // Now lets place another mining attempt

	  await miner.sendTransaction({value: '10000000000000000',
                                 from: accounts[0],
                                 gas: '200000'});

	  // let's mine the next block
     for (var i=101; i<151; i++) {
         await miner.mine({gas: '500000'});
         // Fast forward
         await bte_instance.set_block((50*i)+1);
         await miner.set_block((50*i)+1);
         await miner.claim(i-1, accounts[0], {gas: '400000'});
     }

	  // I now should have an aggregate balance of 150 block windows
      balance = await miner.balanceOf(accounts[0]);
      assert.equal(balance.valueOf(), new BigNumber(150*(100*(10**8))).valueOf());

      // Now let's do a redemption
     await miner.sendTransaction({value: '0',
                                 from: accounts[0],
                                 gas: '1000000'});

      // Now I should have a balance of 0 in the mining pool

      balance = await miner.balanceOf(accounts[0]);
      assert.equal(balance.valueOf(), 0);

      // But our BTE balance should be 15000

      let bte_balance = await bte_instance.balanceOf(accounts[0]);
      assert.equal(bte_balance.valueOf(),
      	  new BigNumber(150*(100*(10**8))).valueOf());

      // Now let's do a double redemption without the contract moving forward
      await miner.sendTransaction({value: '0',
                                 from: accounts[0],
                                 gas: '1000000'});

      balance = await miner.balanceOf(accounts[0]);
      assert.equal(balance.valueOf(), 0);

	  // Now lets complete the mining contract window
     for (var i=151; i<201; i++) {
         await miner.mine({gas: '500000'});
         // Fast forward
         await bte_instance.set_block((50*i)+1);
         await miner.set_block((50*i)+1);
         await miner.claim(i-1, accounts[0], {gas: '400000'});
     }

     balance = await miner.balanceOf(accounts[0]);
     assert.equal(balance.valueOf(), new BigNumber(50*(100*(10**8))).valueOf());


     await miner.sendTransaction({value: '0',
                                 from: accounts[0],
                                 gas: '1000000'});

      // Now I should have a balance of 0 in the mining pool

      balance = await miner.balanceOf(accounts[0]);
      assert.equal(balance.valueOf(), 0);

      // But our BTE balance should be 20000

      bte_balance = await bte_instance.balanceOf(accounts[0]);
      assert.equal(bte_balance.valueOf(),
      	  new BigNumber(200*(100*(10**8))).valueOf());

	  // Now lets try and keep mining

      // Now lets redeem the remainder

     //console.log("Accrued loss " + accrued_loss.valueOf());
     //assert.isAbove(0.0003, (accrued_loss.valueOf() / (10**8)));

	  // This is rounding error slippage
     //contract_balance = await web3.eth.getBalance(miner.address);
     //assert.isBelow(contract_balance.valueOf(), 10000000000004000);

	 try {
        await miner.mine({gas: '500000'});
	 } catch (error) {
	 	  assertJump(error);
	 }


  });

  it("should redeem and mine across epoch gaps", async function() {
     let miner = await setup_miner();
     // Do test from 2nd epoch
     // await miner.set_mine_attempts(100);
     
     let contract_balance = await web3.eth.getBalance(miner.address);
     assert.equal(contract_balance.valueOf(), 0);
     
     await miner.sendTransaction({value: '10000000000000000',
                                 from: accounts[0],
                                 gas: '200000'});

     for (var i=1; i<101; i++) {
         await miner.mine({gas: '500000'});
  
           // Fast forward
         await bte_instance.set_block((50*i)+1);
         await miner.set_block((50*i)+1);
         await miner.claim(i-1, accounts[0], {gas: '400000'});
     }

      // Lets get another miner to mine the next epoch

     await miner.sendTransaction({value: '10000000000000000',
                                 from: accounts[1],
                                 gas: '200000'});

     for (var i=101; i<201; i++) {
         await miner.mine({gas: '500000'});
  
           // Fast forward
         await bte_instance.set_block((50*i)+1);
         await miner.set_block((50*i)+1);
         await miner.claim(i-1, accounts[0], {gas: '400000'});
     }


     let balance = await miner.balanceOf(accounts[0]);
      // 100 BTE over 100 BTE blocks
     assert.equal(balance.valueOf(), new BigNumber(100*(100*(10**8))).valueOf());

    // Now lets do a redemption for the first miner

     await miner.sendTransaction({value: '0',
                                 from: accounts[0],
                                 gas: '1000000'});

      // Now I should have a balance of 0 in the mining pool

      balance = await miner.balanceOf(accounts[0]);
      assert.equal(balance.valueOf(), 0);

      let bte_balance = await bte_instance.balanceOf(accounts[0]);
      assert.equal(bte_balance.valueOf(),
      	  new BigNumber((100*(100*(10**8)))).valueOf());
  });


// it("should mine 100 consecutive blocks with huge values", async function() {
//     let miner = await setup_miner();
//     // This exhausts the minimum difficulty over 100 block period
//  
//     await miner.sendTransaction({value: web3.toWei('1000000', 'ether'),
//                                 from: accounts[0],
//                                 gas: '500000'});
//
//     var accrued_loss = new BigNumber(0);
//  
//     for (var i=1; i<101; i++) {
//         await miner.mine({gas: '500000'});
//  
//           // Fast forward
//         await bte_instance.set_block((50*i)+1);
//         await miner.set_block((50*i)+1);
//
//
//         //let total_attempts = await miner.total_mine_attempts();
//         //console.log(total_attempts);
//        // let res = await miner.find_contribution(accounts[0]);
//        // assert.equal(res[0].valueOf(), 0);
//        // assert.equal(res[1].valueOf(), 100000000000000);
//        // assert.equal(res[2].valueOf(), 100000000000000 * i);
//        // assert.equal(res[3].valueOf(), 10000000000000000 - (100000000000000 * i));
//        // assert.equal(res[4].valueOf(), ((i-1)*100)*(10**8));
//
//        // let epoch_record = await miner.get_epoch_record(0);
//
//        // assert.equal(epoch_record[0].valueOf(), i);
//        // assert.equal(epoch_record[1].valueOf(), i-1);
//        // assert.equal(epoch_record[2].valueOf(), 100000000000000 * i);
//        // assert.equal(epoch_record[3].valueOf(), (100 * (i-1)) * (10**8));
//        // assert.equal(epoch_record[4].valueOf(), 100000000000000);
//
//  
//        // // Account is ignored, but maintains interface compat with BTE.
//        await miner.claim(i-1, accounts[0], {gas: '400000'});
//        // At this point we have accrued almost 100
//        // This is because of rounding error with fixed point math
//        let balance = await miner.balanceOf(accounts[0]);
//        assert.isAbove(balance.valueOf(), 99.999*(10**8));
//        accrued_loss = accrued_loss.plus(new BigNumber(100*(10**8)).minus(balance));
//
//        //console.log(balance.valueOf());
//        // Claim thus far
//        await miner.sendTransaction({value: '0',
//                                 from: accounts[0],
//                                 gas: '200000'});
//
//        //  miner balance should always be 0
//        //  since we are redeeming every single attempt
//        balance = await miner.balanceOf(accounts[0]);
//        assert.equal(balance.valueOf(), 0);
//     }
//
//     console.log("Accrued loss " + accrued_loss.valueOf());
//     assert.isAbove(0.0003, (accrued_loss.valueOf() / (10**8)));
//
//  });



});
