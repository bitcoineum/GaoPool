/*
 * Bitcoineum Miner
 * Copyright 2017, the Bitcoineum Development team
 * Mining interface to Ethereum smart contract
 *
 */

'use strict';

import Web3 from 'web3';
import { default as contract } from 'truffle-contract'
import EthereumBlocks from 'ethereum-blocks'
import BigNumber from 'bignumber.js'


class BitcoineumBlock {

	constructor(miner) {
		        	
		        	this.miner = miner;
		            this.blockNumber = miner.blockNumber;
		            this.reward = miner.calculateMiningReward();
		            this.payed = false;
		            this.payee = null;
		            this.didWin = false;
	}

}

export default class BitcoineumMiner {

	constructor(provider, miningAccount, logFun, bitcoineum_adapter) {
		var self = this;
		logFun ? this.logger = logFun : this.logger = console.log;
		self.logger("Initializing Bitcoineum Miner...");
		self.logger("Using mining account: " + miningAccount);
		this.bitcoineum_adapter = contract(bitcoineum_adapter);
		this.bitcoineum_adapter.setProvider(provider);

		self.provider = new Web3(provider);
		this.mining_account = miningAccount;
		this.mining_account = miningAccount;
		this.default_mine_gas = 1200000;
		this.default_claim_gas = 1200000;
		this.default_gas_price = 0; // This is set by default_price callback
		this.highWaterMark = new BigNumber(self.provider.toWei('28', 'gwei'));
        self.default_gas_price = self.provider.toWei('5', 'gwei');
		this.auto_mine = true;

		this.tracked_blocks = {};

		this.pending_won_blocks = {};

		this.pending_check_blocks = {};

		this.external_block = null;

		this.blockNumber = null;
		this.blockCreationRate = 50;

		this.minimumMineAttempt = null;
	}

	async bootstrap() {
		this.waitForSync();
		this.syncStatusChange();
		let bte = await this.bitcoineum_adapter.deployed();
		let address = await bte.address;
		console.log("Pool address is: " + address);

    }



	set_mining_account(miningAccount) {
		if (self.provider.isAddress(miningAccount)) {
			this.mining_account = miningAccount;
			this.logger("New mining account: " + this.mining_account);
		} else {
			this.logger("Invalid Ethereum account.");
		}
	}

	set_mine_gas(value) {
	    this.default_mine_gas = value;
    }

    set_claim_gas(value) {
        this.default_claim_gas = value;
    }

    set_gas_price(value) {
        this.default_gas_price = value;
    }

	waitForSync() {
		var self = this;
		self.logger("Waiting for sync...");
        self.provider.eth.getSyncing(function(error, sync){
            if(!error) {
                if(sync === true) {
                   self.provider.reset(true);
                } else if(sync) {
                   self.logger("Syncing: " + sync.startingBlock + " => " + sync.currentBlock + " => " + sync.highestBlock);
                   setTimeout(function() {
                   	   self.waitForSync();
				   }, 2500)
                } else {
                	self.provider.eth.getBlock('latest', function(err, Block) {
                		if (err != null) {
							self.logger("There was an error getting the latest block");
							self.logger("Try reloading");
							self.logger(err);
							return;
						} else {
						    console.log("initialize state");
                			self.initializeState(Block.number);
						}
					});
                }
            } else {
            	 self.logger(error);
		    }
        });
	}


	syncStatusChange() {
		var self = this;
		self.provider.eth.isSyncing(function(Sync) {
			self.logger("Syncing state transition...");
		});

	}

	async update_balance() {
		var bte;
		try {
		    bte = await this.bitcoineum_adapter.deployed();
        } catch(error) {
            throw(error);
        }

		let a = await bte.balanceOf.call(this.mining_account);
		this.balance = a.dividedBy(100000000).valueOf();
	}

	async update_state() {

        var self = this;
        var bte = await self.bitcoineum_adapter.deployed();
        
        // Calculate the currently active Bitcoineum block
        self.blockNumber = self.currentBlock();

        if (!self.tracked_blocks.length) {
           // Add the initial block
           self.addInitialBlock(); // b.currentAttemptOffset 
        }

    }

	async initializeState(currentExternalBlock) {
        var self = this;
        await self.update_balance();
	    self.external_block = currentExternalBlock; // External best block on sync
        await self.update_state();
        self.printStats();
	    self.subscribeBlockWatching(); // Let's watch for new blocks
	}

	async printStats() {
	    let minerbalance = self.provider.eth.getBalance(this.mining_account);
        var self = this;
		self.logger("Miner State");
		self.logger("-------------------");
		self.logger("Bitcoineum balance: " + self.balance);
		self.logger("Miner ethereum balance: " + minerbalance + " (" + self.provider.fromWei(minerbalance, 'ether') + " ether)");
		self.logger("Block Window: " + self.blockNumber);
		self.logger("Minimum threshold Wei: " + self.minimumDifficultyThresholdWei + " (" + self.provider.fromWei(self.minimumDifficultyThresholdWei, 'ether') + " ether)");
		self.logger("Minimum mining attempt Wei: " + self.minimumMineAttempt + " (" + self.provider.fromWei(self.minimumMineAttempt, 'ether') + " ether)");
		self.logger("Block creation rate: " + self.blockCreationRate);
		self.logger("Difficulty adjustment period: " + self.difficultyAdjustmentPeriod);
		self.logger("Last Ethereum block adjustment: " + self.lastDifficultyAdjustmentEthereumBlock);
		self.logger("Total blocks mined: " + self.totalBlocksMined);
		self.logger("Total wei committed for mining period: " + self.totalWeiCommitted + " (" + self.provider.fromWei(self.totalWeiCommitted, 'ether') + " ether)");
		self.logger("Total wei expected for mining period: " + self.totalWeiExpected + " (" + self.provider.fromWei(self.totalWeiExpected, 'ether') + " ether)");
		self.logger("Default mine gas: " + self.default_mine_gas + " gas");
		self.logger("Default claim gas: " + self.default_claim_gas + " gas");
		self.logger("Default gas price: " + self.default_gas_price + " wei" + " (" + self.provider.fromWei(self.default_gas_price, 'ether') + " ether)");
		self.logger("-------------------");
		self.printConfig();
	}

	printConfig() {
		var self = this;
		self.logger("Miner configuration parameters");
		self.logger("------------------------------");
		self.logger("Mining Account: " + self.mining_account);
		self.logger("For credit to: " + self.mining_account);
		self.logger("Maximum attempt value: " + self.maxAttemptValue + " (" + self.provider.fromWei(self.maxAttemptValue, 'ether') + " ether)");
		self.logger("Maximum attempt percentage: " + self.attemptPercentage * 100 + "%");
		self.logger("------------------------------");
	}

	subscribeBlockWatching() {
		var self = this;
		this.blocks = new EthereumBlocks({ web3: self.provider });
        this.blocks.registerHandler('incomingBlockHandler',
        	 (eventType, blockId, data) => {
          switch (eventType) {
            case 'block':
              
              /* data = result of self.provider.eth.getBlock(blockId) */
              self.external_block = data.number;
              if (self.currentBlock() != self.blockNumber) {
              	  // We just switched block boundaries
              	  self.addNewBlock(data);
			  }
			  self.logger(".");
              break;
            case 'error':
              /* data = Error instance */
              console.error(data);
              break;
          }
        });
      this.blocks.start().then((started) => {
      		  self.logger (started ? 'Block watch started' : 'Block watch already running');
	  }).catch(console.error);
	}

	addInitialBlock() {
		var self = this;
		self.blockNumber = self.currentBlock();
		self.tracked_blocks[self.blockNumber] = new BitcoineumBlock(self);
		self.logger("Initial Bitcoineum block: " + self.blockNumber + "(" + self.external_block + ")");
		// Let's add previous blocks as if they were attempted so that we will claim them if we can
		for (var i = self.blockNumber-1; i > self.blockNumber-4; i--) {
		    self.logger("adding tracking block for " + i);
		    this.tracked_blocks[i] = new BitcoineumBlock(this);
		    this.tracked_blocks[i].miningAttempted = true;
        }
	}

	async addNewBlock(BlockData) {
		var self = this;
		// Create a new block entry
		self.blockNumber = self.currentBlock();
		// Check three blocks back / 150 ethereum blocks
		var previous_blocknum = self.blockNumber - 3;
		// Just because we are creating a new Bitcoineum block doesn't mean that the
		// block exists in the Bitcoineum contract, that won't happen until there is a mining
		// attempt.
		// Here we will create block data based on known state, and upate it as we get events

		// Check if two blocks previous has been recorded
		// And if we want to try and claim a reward

		var b = self.tracked_blocks[previous_blocknum];
		if (b) {
			// The previous block exists, and is now mature
			if (b.miningAttempted) {
				// I also tried to mine this
				self.check(previous_blocknum, function(Result) {
					if (Result) {
						if (self.auto_mine) {
						    self.logger ("Should have won block " + previous_blocknum + " attempting claim.");
						    self.claim(previous_blocknum);
						}
					} else {
						self.logger ("Block window " + previous_blocknum + " [Missed]");
					}
				});
			} else {
				self.logger("Block window " + previous_blocknum + " [Closed] ");
			}
			delete self.tracked_blocks[previous_blocknum];
		}

		self.tracked_blocks[self.blockNumber] = new BitcoineumBlock(self);
		self.logger("Block window " + self.blockNumber + " (" + self.external_block + ")[Open]");
		// If we are auto mining, then kick off a mine attempt for this block
		// given the miner parameters
		if (self.auto_mine) {
		        self.calculate_gas();
		}
	}

	isBlockMature(Block) {
		return (this.blockNumber > (Block.blockNumber + 1 * this.blockCreationRate));
	}

	currentBlock() {
		return Math.trunc(this.external_block / this.blockCreationRate);
	}

	setMiningAccount(account) {
		return self.provider.isAddress(account) ? this.mining_account = account && true : false;
	}

	calculateMiningReward() {
		var self = this;
		let mined_block_period = 0;
        if (self.totalBlocksMined < self.rewardAdjustmentPeriod) {
             mined_block_period = self.rewardAdjustmentPeriod;
        } else {
             mined_block_period = self.totalBlocksMined;
        }

        let total_reward = 100 * (10**8);
        for (var i=1; i < (mined_block_period / self.rewardAdjustmentPeriod); i++) {
            total_reward = total_reward / 2;
        }
        return total_reward;
	}

	async calculate_gas() {
	    var self = this;
	    self.provider.eth.getGasPrice(function(err, NetworkPrice) {
	        if (err) {
	            console.log("error setting gas price dynamically");
	            console.log(err);
            } else {
                if (NetworkPrice.greaterThan(self.highWaterMark)) {
                    self.default_gas_price = NetworkPrice.plus(new BigNumber(self.provider.toWei('5', 'gwei'))).toString();
                } else {
                    self.default_gas_price = self.provider.toWei('5', 'gwei');
                }
            }
            self.canMine();
        });
    }

    async canMine() {
        var self = this;
		var bte = await this.bitcoineum_adapter.deployed()
		try {
		    let Res = await bte.canMine.call({from: self.mining_account});
		    if (Res) {
		    	self.checkMiningAttempted();
            } else {
            	console.log("Mining power is too low");
            }
		} catch(e) {
			self.logger("Block window canMine " + self.blockNumber + " [Error]");
			self.logger(e);
		}

    }


    async checkMiningAttempted() {
        var self = this;
		var bte = await this.bitcoineum_adapter.deployed()
		try {
		    let Res = await bte.checkMiningAttempt.call(self.blockNumber, bte.address,
		                                           {from: self.mining_account});
		    if (Res) {
		        self.logger("Block window " + self.blockNumber + " mining already attempted.");
            } else {
                self.mine();
            }
		} catch(e) {
			self.logger("Block window check attempt " + self.blockNumber + " [Error]");
			self.logger(e);
		}

    }

	// Send a mine attempt transaction
	// If there are no arguments use the current minimum difficulty
	async mine() {
		var self = this;
		var bte = await this.bitcoineum_adapter.deployed()
		try {
		    let Res = await bte.mine({from: self.mining_account,
		                             gas: self.default_mine_gas,
		                             gasPrice: self.default_gas_price});
		    self.logger("Block window " + self.blockNumber + " [Pending]");
		    self.tracked_blocks[self.blockNumber].miningAttempted = true;
		} catch(e) {
			self.logger("Block window " + self.blockNumber + " [Error]");
			self.logger(e);
		}
	}

	async check_winner(block_number) {
	    var self = this;
		var bte = await self.bitcoineum_adapter.deployed();
		let Result = await bte.checkWinning.call(block_number,{from: self.mining_account});
        self.logger("Check: " + block_number + " " + Result);
    }


	// Did we win this block?
	// We ask the network instead of trying
	// to do this locally because block reorganizations
	// could mislead us.
	// If the network says we won, then we can try and claim our prize
	async check(block_to_check, callbackFun) {
		var self = this;
		self.logger("Block window " + block_to_check + " [Check] ");
		var bte = await self.bitcoineum_adapter.deployed();

		try {
			let Result = await bte.checkWinning.call(block_to_check,
			                                     {from: self.mining_account});
		    self.logger("mining attempted so checking");
		    if (callbackFun) {
		    	callbackFun(Result);
		    } else {
		    	// Default fun
		    	if (Result) {
		    		self.logger("Block window " + block_to_check + " [Won!]");
		    	} else {
		    		self.logger("Block window " + block_to_check + " [Lost]");
		    	}
		    }
		} catch(e) {
          self.logger(e);
          self.logger("Block window " + block_to_check + " [Error]");
        }
	}

	// If we won, we should be able to claim the block
	// and redeem the Bitcoineum into our account
	
	async claim(block_to_claim) {
		var self = this;
		var bte = await self.bitcoineum_adapter.deployed();
		try {
			let Result = await bte.claim(block_to_claim,
				             self.mining_account, // forCreditTo
				             {from: self.mining_account,
				                 gas: self.default_claim_gas,
				                 gasPrice: self.default_gas_price});
			self.logger("Block window " + block_to_claim + " [Claimed]");
			delete self.tracked_blocks[block_to_claim];
			self.update_balance();
		} catch(e) {
			self.logger(e);
			self.logger("Block window " + block_to_claim + " [Claim Error]");
		}
	}


}
