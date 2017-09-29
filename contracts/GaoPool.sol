// This is a dual licensed product available under commercial license
// and under the terms of the GPLv3
// Copyright (C) <2017>  <Matthew Branton>
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.
//
// You should have received a copy of the GNU General Public License
// along with this program.  If not, see <http://www.gnu.org/licenses/>.
//


pragma solidity ^0.4.15;

import './BitcoineumInterface.sol';
import './AceDepositInterface.sol';
import 'zeppelin-solidity/contracts/ReentrancyGuard.sol';
import 'zeppelin-solidity/contracts/ownership/Ownable.sol';


// Gao Pool, unlimited user miner with contract epochs
// in honor of Gao.

contract GaoPool is Ownable, ReentrancyGuard {

    string constant public pool_name = "GaoPool Unlimited";
    string constant public pool_version = "0.3";

    // Contract period window
    uint256 public contract_period = 100;

    // Lifetime attempt
    uint256 public total_attempt = 0;

    uint256 public constant divisible_units = 1000000000;
    uint256 public blockCreationRate = 0;

    // Mine attempts will be used to track the epoch instead of the native
    // Ethereum block windows like BTE. This preserves value in the event of
    // a network disruption.

    uint256 public total_mine_attempts = 0;


    // Pointer to mining contract
    BitcoineumInterface base_contract;

    // Pointer to ACE Depository
    AceDepositInterface ace_bank;

    address public ace_contract_addr;

    // Each incoming address gets a user struct
    struct user {
        uint256 epoch; // Last epoch committed to
        uint256 mine_attempt_started; // The block within the epoch the user made a mine attempt
        uint256 partial_attempt; // The attempt value per block
        uint256 balance; // Accumulated lazily evaluated balance
        uint256 last_redemption_epoch_balance;
        uint256 last_redemption_epoch_claimed;
        bool isCreated;
    }

    // Each epoch represents a contract period of blocks
    struct epoch {
        uint256 mined_blocks;
        uint256 claimed_blocks;
        uint256 total_claimed;
        uint256 actual_attempt;
        uint256 adjusted_unit;
    }


    mapping (address => user) public users;
    mapping (uint256 => epoch) public epochs;
    mapping (uint256 => uint256) public bte_block_to_epoch;

    // Pool administrative variables
 
    // Percentage of BTE Pool takes on Ether submitted
    // This is for ACE token holders
    uint256 public pool_percentage = 0;
    // Maximum percentage the pool can take (be careful to guard against funds theft)
    uint256 public max_pool_percentage = 50;

    // Is the pool accepting more users
    bool public isPaused = false;

    // Set the maximum bet for a single user
    uint256 public max_bet = 10000 ether;


    function GaoPool() {
      blockCreationRate = 50; // match bte
      base_contract = BitcoineumInterface(get_bitcoineum_contract_address());
      ace_contract_addr = 0x31d26Dc9c64b355b561e8DcD2ba354B93D15EeDd;
      ace_bank = AceDepositInterface(get_ace_contract_address());
    }

    function get_epoch_record(uint256 _epoch) public constant returns (uint256, uint256, uint256, uint256, uint256) {
       epoch storage e = epochs[_epoch];
       return (e.mined_blocks, e.claimed_blocks, e.actual_attempt, e.total_claimed, e.adjusted_unit);
    }
       

    function get_bitcoineum_contract_address() public constant returns (address) {
       //return 0x73dD069c299A5d691E9836243BcaeC9c8C1D8734; // Production
       return 0x213780b6cf4B265fEdEFF4C8aAd239a85983705D; // Ropsten
    }

    function get_ace_contract_address() public constant returns (address) {
       return ace_contract_addr;
    }


    function current_external_block() public constant returns (uint256) {
        return block.number;
    }

    function external_to_internal_block_number(uint256 _externalBlockNum) public constant returns (uint256) {
       return _externalBlockNum / blockCreationRate;
    }

    function current_epoch() public constant returns (uint256) {
       return calculate_epoch(total_mine_attempts);
    }

    function calculate_epoch(uint256 _mineAttempts) public constant returns (uint256) {
        return _mineAttempts / contract_period;
    }

    function remaining_epoch_blocks() constant public returns (uint256) {
       if (total_mine_attempts < contract_period) {
          return contract_period - total_mine_attempts;
       }
       return contract_period - (total_mine_attempts % 100);
    }

   function calculate_proportional_reward(uint256 _baseReward, 
                                          uint256 _userContributionWei,
                                          uint256 _totalCommittedWei) public constant returns (uint256) {

       require(_userContributionWei <= _totalCommittedWei);
       if (_totalCommittedWei == 0) {
          return 0;
        }

       uint256 intermediate = ((_userContributionWei * divisible_units) / _totalCommittedWei);

       if (intermediate >= divisible_units) {
          return _baseReward;
       } else {
          return intermediate * (_baseReward / divisible_units);
       }
    }


    function refresh_user(address _who, uint256 _value) internal {
       uint256 roll_attempt = 0; 
       user storage u = users[_who];
       if (u.isCreated && u.epoch == current_epoch()) {
          // We need to roll their partial attempt forward
          roll_attempt = u.partial_attempt;
       }
       u.epoch = current_epoch();
       // Evenly divide the attempt over the remaining blocks in this epoch
       uint256 _current_remaining = remaining_epoch_blocks();
       uint256 _splitAttempt = _value / _current_remaining;
       u.mine_attempt_started = total_mine_attempts;
       u.last_redemption_epoch_balance = epochs[u.epoch].actual_attempt;
       u.last_redemption_epoch_claimed = epochs[u.epoch].total_claimed;
       u.partial_attempt = _splitAttempt + roll_attempt;
       u.isCreated = true;
    }

    function adjust_epoch_up(uint256 _epochNumber, uint256 _partialAttempt) internal {
         // Adjust the unit for each attempt period
         epochs[_epochNumber].adjusted_unit += _partialAttempt;
    }

    function adjust_epoch_down(uint256 _epochNumber, uint256 _partialAttempt) internal {
         // Adjust the unit for each attempt period
         uint256 adjusted = epochs[_epochNumber].adjusted_unit;
         adjusted -= _partialAttempt;
         if (adjusted > epochs[_epochNumber].adjusted_unit) {
           adjusted = 0;
         }
         epochs[_epochNumber].adjusted_unit = adjusted;
    }


    function calculate_minimum_contribution() public constant returns (uint256)  {
       return base_contract.currentDifficultyWei() / 10000000 * contract_period;
    }

   event LogEvent(
       string _info,
       uint256 _extra
   );

   function adjust_token_balance(address _who) internal {
     user storage u = users[_who];
     epoch memory ep = epochs[u.epoch];
     uint256 _balance = calculate_proportional_reward(ep.total_claimed - u.last_redemption_epoch_claimed,
                                                       total_contribution_for_epoch(_who),
                                                       ep.actual_attempt - u.last_redemption_epoch_balance);
     u.balance += _balance;
   }

    function () payable {
       
       address _who = msg.sender;
       deposit(_who);
    }

    // A deposit can be done either directly via the default payment interface
    // or via the deposit function so that a smart contract can intermediate the
    // the deposit process.
    function deposit(address _who) public payable nonReentrant {
       // First thing to do is check on whether we can do a redemption
       // We only allow redemption past the Epoch window

       if (msg.value == 0) {
         if (users[_who].isCreated) {
             adjust_token_balance(_who); 
             do_redemption(_who);
         }
         return;
       }

       // We need to extract the pool fee up front for ACE holders
       uint256 ace_cut = (msg.value / 100) * pool_percentage;
       uint256 remainder = msg.value - ace_cut;
       if (ace_cut > 0) {
           if (!ace_bank.send(ace_cut)) {
               revert();
           }
       }

     
       require(remainder >= calculate_minimum_contribution());
       require(remainder < max_bet);
       require(!isPaused);

       uint256 _current_epoch = current_epoch();

       if (users[_who].isCreated) {
            adjust_token_balance(_who);
            adjust_epoch_down(_current_epoch, users[_who].partial_attempt);
            refresh_user(_who, remainder);
            adjust_epoch_up(_current_epoch, users[_who].partial_attempt);
       } else {
            // No entry exists for this user, so first time new attempt
            refresh_user(_who, remainder);
            adjust_epoch_up(_current_epoch, users[_who].partial_attempt);
        }
    }

    function is_epoch_passed(uint256 _epoch) public constant returns(bool) {
        return (_epoch < current_epoch());
    }

    function do_redemption(address _who) internal {
      uint256 balance = users[_who].balance;
      if (balance > 0) {
         LogEvent("Balance", base_contract.balanceOf(this));
         base_contract.transfer(_who, balance);
         users[_who].balance = 0;
         users[_who].mine_attempt_started = total_mine_attempts;
      }
     }

    function mine() external nonReentrant
    {
     // Did someone already try to mine this block?
     uint256 _blockNum = external_to_internal_block_number(current_external_block());
     require(!base_contract.checkMiningAttempt(_blockNum, this));

     // Get the current epoch information
     uint256 _epoch = current_epoch();
     epoch storage e = epochs[_epoch];
     bte_block_to_epoch[_blockNum] = _epoch;
     // We need to track which contract window this attempt is associated with
     if (e.adjusted_unit > 0) {
        e.actual_attempt += e.adjusted_unit;
        // Now we have a total contribution amount
        base_contract.mine.value(e.adjusted_unit)();
        e.mined_blocks += 1;
        total_mine_attempts += 1;
     }
    }

   function claim(uint256 _blockNumber, address forCreditTo)
                  nonReentrant
                  external returns (bool) {

                  // Did we win the block in question
                  require(base_contract.checkWinning(_blockNumber));

                  uint256 initial_balance = base_contract.balanceOf(this);

                  // We won let's get our reward
                  base_contract.claim(_blockNumber, this);

                  uint256 balance = base_contract.balanceOf(this);

                  // Claims need to be applied to the window that the mine attempt occured in
                  uint256 _epoch = bte_block_to_epoch[_blockNumber];
                  delete bte_block_to_epoch[_blockNumber];
                  epoch storage e = epochs[_epoch];
                  e.total_claimed += (balance - initial_balance);
                  e.claimed_blocks += 1;
    }

    // External utility functions

    function balanceOf(address _addr) constant returns (uint256 balance) {
      // We can't calculate the balance until the epoch is closed
      // but we can provide an estimate based on the mining
      user memory u = users[_addr];
      if (!u.isCreated) {
          return 0;
        }
        epoch storage ep = epochs[u.epoch];
        uint256 _balance = calculate_proportional_reward(ep.total_claimed - u.last_redemption_epoch_claimed,
                                                         total_contribution_for_epoch(_addr),
                                                         ep.actual_attempt - u.last_redemption_epoch_balance);
        return u.balance + _balance;
      }

    function pool_set_percentage(uint8 _percentage) external nonReentrant onlyOwner {
       // Just in case owner is compromised
       require(_percentage < max_pool_percentage);
       pool_percentage = _percentage;
    }

    function pool_set_paused(bool _paused) external nonReentrant onlyOwner {
       isPaused = _paused;
    }

    function pool_set_max_bet(uint256 _value) external nonReentrant onlyOwner {
       max_bet = _value;
    }

    function pool_set_ace_bank(address _addr) external nonReentrant onlyOwner {
       ace_contract_addr = _addr;
       ace_bank = AceDepositInterface(get_ace_contract_address());
    }


    function total_contribution_for_epoch(address _who) constant internal returns (uint256) {
      user memory u = users[_who];

      uint256 _block_count = total_mine_attempts - u.mine_attempt_started;
      if (_block_count > contract_period) {
         if (u.mine_attempt_started < contract_period) {
            _block_count = contract_period - u.mine_attempt_started;
          } else {
            _block_count = contract_period - (u.mine_attempt_started % contract_period);
          }
      }
      return (u.partial_attempt * _block_count);
    }

    function total_contribution_for_epoch_remaining(address _who) constant internal returns (uint256) {
      user memory u = users[_who];
      if (u.epoch != current_epoch()) {
          return 0;
      }

      uint256 _remaining_blocks;
      if (total_mine_attempts < contract_period) {
         _remaining_blocks = contract_period - total_mine_attempts;
      } else {
         if ((total_mine_attempts % contract_period) == 0) {
            _remaining_blocks = contract_period;
         } else {
           _remaining_blocks = (contract_period - (total_mine_attempts % 100));
         }
      }
      return (u.partial_attempt * _remaining_blocks);
    }


    function find_contribution(address _who) constant external returns (uint256, uint256, uint256, uint256, uint256, uint256, uint256) {
      user memory u = users[_who];
      epoch storage ep = epochs[u.epoch];
      if (u.isCreated) {
         return (u.epoch,
                 u.partial_attempt,
                 total_contribution_for_epoch(_who),
                 total_contribution_for_epoch_remaining(_who),
                 balanceOf(_who),
                 ep.total_claimed,
                 ep.actual_attempt
                 );
      } else {
        return (0,0,0,0,0,0,0);
        }
    }

   function checkMiningAttempt(uint256 _blockNum, address _sender) constant public returns (bool) {
      return base_contract.checkMiningAttempt(_blockNum, _sender);
   }
   
   function checkWinning(uint256 _blockNum) constant public returns (bool) {
     return base_contract.checkWinning(_blockNum);
   }

   function canMine() constant external returns (bool) {
      uint256 _epoch = current_epoch();
      uint256 _adjusted_unit = epochs[_epoch].adjusted_unit;
      if (_adjusted_unit > calculate_minimum_contribution()) {
         return true;
      }
      return false;
   }



}
