pragma solidity ^0.4.13;

import './BitcoineumInterface.sol';
import 'zeppelin-solidity/contracts/ReentrancyGuard.sol';
import 'zeppelin-solidity/contracts/ownership/Ownable.sol';


// Gao Pool, unlimited user miner with contract epochs
// in honor of Gao.

contract GaoPool is Ownable, ReentrancyGuard {

    string constant public pool_name = "GaoPool Unlimited";
    string constant public pool_version = "0.2";

    // Contract period window
    uint256 public contract_period = 100;

    // Lifetime attempt
    uint256 public total_attempt = 0;

    uint256 public constant divisible_units = 10000000;
    uint256 public blockCreationRate = 0;


    // Pointer to mining contract
    BitcoineumInterface base_contract;

    // Each incoming address gets a user struct
    struct user {
        uint256 epoch; // Last epoch committed to
        uint256 total_attempt;
        uint256 partial_attempt;
        uint256 balance; // Accumulated lazily evaluated balance
        bool isCreated;
        bool isRedeemed;
    }

    // Each epoch represents a contract period of blocks
    struct epoch {
        uint256 mined_blocks;
        uint256 claimed_blocks;
        uint256 total_attempt;
        uint256 total_claimed;
        uint256 actual_attempt;
        uint256 adjusted_unit;
        bool isSealed;
    }


    mapping (address => user) public users;
    mapping (uint256 => epoch) public epochs;


    // Pool administrative variables
 
    // Percentage of BTE Pool takes for operations on withdrawal
    uint256 public pool_percentage = 0;
    // Maximum percentage the pool can take (be careful to guard against funds theft)
    uint256 public max_pool_percentage = 10;

    // Is the pool accepting more users
    bool public isPaused = false;

    // Set the maximum bet for a single user
    uint256 public max_bet = 1000 ether;


    function GaoPool() {
      blockCreationRate = 50; // match bte
      base_contract = BitcoineumInterface(get_bitcoineum_contract_address());
    }

    function get_epoch_record(uint256 _epoch) public constant returns (uint256, uint256, uint256, uint256, uint256, uint256) {
       epoch storage e = epochs[_epoch];
       return (e.mined_blocks, e.claimed_blocks, e.total_attempt, e.actual_attempt, e.total_claimed, e.adjusted_unit);
    }
       

    function get_bitcoineum_contract_address() public constant returns (address) {
       return 0x73dD069c299A5d691E9836243BcaeC9c8C1D8734; // Production
       // return 0x7e7a299da34a350d04d204cd80ab51d068ad530f; // Testing
    }

    function current_external_block() public constant returns (uint256) {
        return block.number;
    }

    function external_to_internal_block_number(uint256 _externalBlockNum) public constant returns (uint256) {
       return _externalBlockNum / blockCreationRate;
    }

    function current_epoch() constant returns (uint256) {
       return calculate_epoch(current_external_block());
    }

    function calculate_epoch(uint256 _blockNum) constant returns (uint256) {
        return external_to_internal_block_number(_blockNum) / contract_period;
    }

    function remaining_epoch_blocks(uint256 _epoch) constant public returns (uint256) {
       uint256 _epoch_intermediary = (external_to_internal_block_number(current_external_block()) - (_epoch * contract_period));
       if (_epoch_intermediary > contract_period) {
           return 0;
       }

       uint256 _remaining = contract_period - _epoch_intermediary;
       return _remaining;
    }

   function calculate_proportional_reward(uint256 _baseReward, uint256 _userContributionWei, uint256 _totalCommittedWei) public constant returns (uint256) {
       require(_userContributionWei <= _totalCommittedWei);
       require(_userContributionWei > 0);
       require(_totalCommittedWei > 0);
       uint256 intermediate = ((_userContributionWei * divisible_units) / _totalCommittedWei);

       if (intermediate >= divisible_units) {
          return _baseReward;
       } else {
          return intermediate * (_baseReward / divisible_units);
       }
    }


    function add_user(address _who, uint256 _value, uint256 _current_epoch) internal {
       users[_who].epoch = _current_epoch;
       // Evenly divide the attempt over the remaining blocks in this epoch
       uint256 _current_remaining = remaining_epoch_blocks(_current_epoch);
       LogEvent("remainng", _current_remaining);
       LogEvent("value", _value);
       uint256 _splitAttempt = _value / _current_remaining;
       uint256 _current_epoch_attempt = _splitAttempt * _current_remaining;
       users[_who].total_attempt = _current_epoch_attempt;
       users[_who].partial_attempt = _splitAttempt;
       users[_who].isCreated = true;
       users[_who].isRedeemed = false;
    }

    function adjust_epoch(uint256 _epochNumber, uint256 _currentAttempt, uint256 _partialAttempt) internal {
        // Now that we have a user entry we need to calculate a new adjusted unit for the current and next epoch
         epochs[_epochNumber].total_attempt += _currentAttempt;
         // Adjust the unit for each attempt period
         epochs[_epochNumber].adjusted_unit += _partialAttempt;
    }

    function calculate_minimum_contribution() public constant returns (uint256)  {
       return base_contract.currentDifficultyWei() / 10000000 * contract_period;
    }

   event LogEvent(
       string _info,
       uint256 _extra
   );

    function () payable {
     
       require(msg.value >= calculate_minimum_contribution());


       // Max bet to 
       if (msg.value > max_bet) {
          // Pool is going to reject this bet
          revert();
       }

       // This is so the pool can be closed for maintenance
       if (isPaused) {
           revert();
       }

       uint256 _current_epoch = current_epoch();
       if (users[msg.sender].isCreated) {
         // The user entry exists
         // if the epoch is passed we need to roll the balance from that epoch to the user if it hasn't been done already
         // and treat it like a new epoch
         // if the epoch hasn't passed we need to readjust the the units ???????/XXXX
         if (users[msg.sender].epoch < _current_epoch) {
            // The user's last betting period is over
            // Let's add to the user's balance
            epoch storage ep = epochs[users[msg.sender].epoch];
            uint256 _balance = calculate_proportional_reward(ep.total_claimed,
                                                             users[msg.sender].total_attempt,
                                                             ep.total_attempt);
            users[msg.sender].balance += _balance;

            // Let's redeem the users balance
            do_redemption(msg.sender);

            // Ok now we need to create a completely new user entry
            add_user(msg.sender, msg.value, _current_epoch);
            adjust_epoch(_current_epoch,
                         users[msg.sender].total_attempt,
                         users[msg.sender].partial_attempt);
         } else {
            // We are currently in the Epoch
            // Users cannot adjust the current bet or redeem
            // This is just to keep the code simple in this version of GaoPool
            // Additional bets can bet made on other accounts
            revert();
            }
         } else {

         // No entry exists for this user, so first time new attempt
         add_user(msg.sender, msg.value, _current_epoch);
         adjust_epoch(_current_epoch,
                      users[msg.sender].total_attempt,
                      users[msg.sender].partial_attempt);
         LogEvent("Got this far", 0);

        }
    }

    function bte_block_to_epoch(uint256 _blockNumber) constant returns (uint256) {
       return (_blockNumber / contract_period);
    }

    function do_redemption(address _who) internal {
      uint256 balance = users[_who].balance;
      if (balance > 0) {
         uint256 owner_cut = (balance / 100) * pool_percentage;
         uint256 remainder = balance - owner_cut;
         if (owner_cut > 0) {
             base_contract.transfer(owner, owner_cut);
         }
         base_contract.transfer(_who, remainder);
         users[_who].balance = 0;
         users[_who].isRedeemed = true;
     }
     }

    function redeem() external nonReentrant
    {
       uint256 _current_epoch = current_epoch();
       uint256 _user_epoch = users[msg.sender].epoch;
       if (_user_epoch < _current_epoch) {
          require(!users[msg.sender].isRedeemed);

          epoch storage ep = epochs[_user_epoch];
          uint256 _balance = calculate_proportional_reward(ep.total_claimed,
                                                           users[msg.sender].total_attempt,
                                                           ep.total_attempt);
           users[msg.sender].balance += _balance;
           do_redemption(msg.sender);
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
     if (e.adjusted_unit > 0) {
        e.actual_attempt += e.adjusted_unit;
        // Now we have a total contribution amount
        base_contract.mine.value(e.adjusted_unit)();
        e.mined_blocks += 1;
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

                  // What Epoch does this block fall into
                  uint256 _epoch = bte_block_to_epoch(_blockNumber);
                  epoch storage e = epochs[_epoch];
                  e.total_claimed += (balance - initial_balance);
                  e.claimed_blocks += 1;
    }

    // External utility functions

    function balanceOf(address _addr) constant returns (uint256 balance) {
      // We can't calculate the balance until the epoch is closed
      // but we can provide an estimate based on the mining
      if (users[_addr].isCreated) {
        if (users[_addr].isRedeemed) {
           return 0;
        }
        epoch storage ep = epochs[users[_addr].epoch];
        uint256 _balance = calculate_proportional_reward(ep.total_claimed,
                                                             users[_addr].total_attempt,
                                                             ep.total_attempt);
        return _balance;
      } else {
        // User does not exist
        return 0;
      }
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




    function find_contribution(address _who) constant external returns (uint256, uint256, uint256, uint256) {
    user storage u = users[_who];
    if (u.isCreated) {
       return (u.epoch, u.partial_attempt, u.total_attempt, u.balance);
    } else {
      return (0,0,0,0);
      }
    }

   function checkMiningAttempt(uint256 _blockNum, address _sender) constant public returns (bool) {
      return base_contract.checkMiningAttempt(_blockNum, _sender);
   }
   
   function checkWinning(uint256 _blockNum) constant public returns (bool) {
     return base_contract.checkWinning(_blockNum);
   }



}
