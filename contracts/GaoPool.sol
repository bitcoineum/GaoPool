pragma solidity ^0.4.13;

import './BitcoineumInterface.sol';
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

    uint256 public constant divisible_units = 10000000;
    uint256 public blockCreationRate = 0;

    // Mine attempts will be used to track the epoch instead of the native
    // Ethereum block windows like BTE. This preserves value in the event of
    // a network disruption.

    uint256 public total_mine_attempts = 0;


    // Pointer to mining contract
    BitcoineumInterface base_contract;

    // Each incoming address gets a user struct
    struct user {
        uint256 epoch; // Last epoch committed to
        uint256 mine_attempt_started; // The block within the epoch the user made a mine attempt
        uint256 partial_attempt; // The attempt value per block
        uint256 balance; // Accumulated lazily evaluated balance
        bool isCreated;
        bool isRedeemed;
    }

    // Each epoch represents a contract period of blocks
    struct epoch {
        uint256 mined_blocks;
        uint256 claimed_blocks;
        uint256 total_claimed;
        uint256 actual_attempt;
        uint256 adjusted_unit;
        bool isSealed;
    }


    mapping (address => user) public users;
    mapping (uint256 => epoch) public epochs;
    mapping (uint256 => uint256) public bte_block_to_epoch;

    // Pool administrative variables
 
    // Percentage of BTE Pool takes for operations on withdrawal
    uint256 public pool_percentage = 0;
    // Maximum percentage the pool can take (be careful to guard against funds theft)
    uint256 public max_pool_percentage = 10;

    // Is the pool accepting more users
    bool public isPaused = false;

    // Set the maximum bet for a single user
    uint256 public max_bet = 10000 ether;


    function GaoPool() {
      blockCreationRate = 50; // match bte
      base_contract = BitcoineumInterface(get_bitcoineum_contract_address());
    }

    function get_epoch_record(uint256 _epoch) public constant returns (uint256, uint256, uint256, uint256, uint256) {
       epoch storage e = epochs[_epoch];
       return (e.mined_blocks, e.claimed_blocks, e.actual_attempt, e.total_claimed, e.adjusted_unit);
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
       return calculate_epoch(total_mine_attempts);
    }

    function calculate_epoch(uint256 _mineAttempts) constant returns (uint256) {
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
       require(_userContributionWei > 0);
       require(_totalCommittedWei > 0);

       uint256 intermediate = ((_userContributionWei * divisible_units) / _totalCommittedWei);

       if (intermediate >= divisible_units) {
          return _baseReward;
       } else {
          return intermediate * (_baseReward / divisible_units);
       }
    }


    function refresh_user(address _who, uint256 _value) internal {
       uint256 _current_blocknum = external_to_internal_block_number(current_external_block());
       users[_who].epoch = current_epoch();
       // Evenly divide the attempt over the remaining blocks in this epoch
       uint256 _current_remaining = remaining_epoch_blocks();
       uint256 _splitAttempt = _value / _current_remaining;
       users[_who].mine_attempt_started = total_mine_attempts;
       users[_who].partial_attempt = _splitAttempt;
       users[_who].isCreated = true;
       users[_who].isRedeemed = false;
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

   function adjust_balance() internal {
     epoch memory ep = epochs[users[msg.sender].epoch];
     uint256 _balance = calculate_proportional_reward(ep.total_claimed,
                                                       total_contribution_for_epoch(msg.sender),
                                                       ep.actual_attempt);
     users[msg.sender].balance += _balance;
   }

    function () payable {


       // First thing to do is check on whether we can do a redemption
       // We only allow redemption past the Epoch window

       if (msg.value == 0) {
         if (users[msg.sender].isCreated) {
           if (is_epoch_passed(users[msg.sender].epoch)) {
             adjust_balance(); 
             do_redemption();
           }
         }
         return;
       }
     
       require(msg.value >= calculate_minimum_contribution());
       require(msg.value < max_bet);
       require(!isPaused);

       uint256 _current_epoch = current_epoch();

       if (users[msg.sender].isCreated) {
            adjust_balance();
            adjust_epoch_down(_current_epoch, users[msg.sender].partial_attempt);
            refresh_user(msg.sender, msg.value);
            adjust_epoch_up(_current_epoch, users[msg.sender].partial_attempt);
       } else {
            // No entry exists for this user, so first time new attempt
            refresh_user(msg.sender, msg.value);
            adjust_epoch_up(_current_epoch, users[msg.sender].partial_attempt);
        }
    }

    function is_epoch_passed(uint256 _epoch) constant returns(bool) {
        return (_epoch < current_epoch());
    }

    function do_redemption() internal {
      require(users[msg.sender].isCreated);
      uint256 balance = users[msg.sender].balance;
      if (balance > 0) {
         uint256 owner_cut = (balance / 100) * pool_percentage;
         uint256 remainder = balance - owner_cut;
         if (owner_cut > 0) {
             base_contract.transfer(owner, owner_cut);
         }
         base_contract.transfer(msg.sender, remainder);
         users[msg.sender].balance = 0;
         users[msg.sender].isRedeemed = true;
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
      if (!users[_addr].isCreated) {
          return 0;
        }
        if (users[_addr].isRedeemed) {
           return 0;
        }
        epoch storage ep = epochs[users[_addr].epoch];
        uint256 _balance = calculate_proportional_reward(ep.total_claimed,
                                                             total_contribution_for_epoch(_addr),
                                                             ep.actual_attempt);
        return users[_addr].balance + _balance;
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


    function total_contribution_for_epoch(address _who) returns (uint256) {
      user memory u = users[_who];
      uint256 block_count = total_mine_attempts - u.mine_attempt_started;
      if (block_count > 100) {
         block_count = 100 - (u.mine_attempt_started % 100);
      }
      return (u.partial_attempt * block_count);
    }

    function find_contribution(address _who) constant external returns (uint256, uint256, uint256, uint256) {
      user storage u = users[_who];
      if (u.isCreated) {
         return (u.epoch, u.partial_attempt, total_contribution_for_epoch(_who), u.balance);
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
