pragma solidity ^0.4.13;

import './BitcoineumInterface.sol';
import 'zeppelin-solidity/contracts/ReentrancyGuard.sol';
import 'zeppelin-solidity/contracts/ownership/Ownable.sol';


// Gao Pool, unlimited user miner with contract epochs
// in honor of Gao.

contract GaoPool is Ownable, ReentrancyGuard {

    string constant public poolName = "GaoPool Unlimited";
    string constant public poolVersion = "0.2";

    // Contract period window
    uint256 public contractPeriod = 100;

    // Lifetime attempt
    uint256 public totalAttempt = 0;

    uint256 public constant divisibleUnits = 10000000;
    uint256 public blockCreationRate = 0;

    uint256 public lastMinedBlock = 1000000000;


    // Pointer to mining contract
    BitcoineumInterface baseContract;

    // Each incoming address gets a user struct
    struct user {
        uint256 epoch; // Last epoch committed to
        uint256 totalAttempt;
        uint256 partialAttempt;
        uint256 balance; // Accumulated lazily evaluated balance
        bool isCreated;
        bool isRedeemed;
    }

    // Each epoch represents a contract period of blocks
    struct epoch {
        uint256 minedBlocks;
        uint256 claimedBlocks;
        uint256 totalAttempt;
        uint256 totalClaimed;
        uint256 actualAttempt;
        uint256 adjustedUnit;
        bool isSealed;
    }


    mapping (address => user) public users;
    mapping (uint256 => epoch) public epochs;


    // Pool administrative variables
 
    // Percentage of BTE Pool takes for operations on withdrawal
    uint256 public poolPercentage = 0;
    // Maximum percentage the pool can take (be careful to guard against funds theft)
    uint256 public maxPoolPercentage = 10;

    // Is the pool accepting more users
    bool public isPaused = false;

    // Set the maximum bet for a single user
    uint256 public maxBet = 10000 ether;


    function GaoPool() {
      blockCreationRate = 50; // match bte
      baseContract = BitcoineumInterface(getBitcoineumContractAddress());
    }

    function getEpochRecord(uint256 _epoch) public constant returns (uint256, uint256, uint256, uint256, uint256, uint256) {
       epoch storage e = epochs[_epoch];
       return (e.minedBlocks, e.claimedBlocks, e.totalAttempt, e.actualAttempt, e.totalClaimed, e.adjustedUnit);
    }
       

    function getBitcoineumContractAddress() public constant returns (address) {
       return 0x73dD069c299A5d691E9836243BcaeC9c8C1D8734; // Production
       // return 0x7e7a299da34a350d04d204cd80ab51d068ad530f; // Testing
    }

    function currentExternalBlock() public constant returns (uint256) {
        return block.number;
    }

    function externalToInternalBlockNumber(uint256 _externalBlockNum) public constant returns (uint256) {
       return _externalBlockNum / blockCreationRate;
    }

    function currentEpoch() constant returns (uint256) {
       return calculateEpoch(currentExternalBlock());
    }

    function calculateEpoch(uint256 _blockNum) constant returns (uint256) {
        return externalToInternalBlockNumber(_blockNum) / contractPeriod;
    }

    function remainingEpochBlocks(uint256 _epoch) constant public returns (uint256) {
       uint256 _epochIntermediary = (externalToInternalBlockNumber(currentExternalBlock()) - (_epoch * contractPeriod));
       if (_epochIntermediary > contractPeriod) {
           return 0;
       }

       uint256 _remaining = contractPeriod - _epochIntermediary;
       return _remaining;
    }

    function calculateProportionalReward(uint256 _baseReward, uint256 _userContributionWei, uint256 _totalCommittedWei) public constant returns (uint256) {
        require(_userContributionWei <= _totalCommittedWei);
        require(_userContributionWei > 0);
        require(_totalCommittedWei > 0);
        uint256 intermediate = ((_userContributionWei * divisibleUnits) / _totalCommittedWei);

        if (intermediate >= divisibleUnits) {
            return _baseReward;
        } else {
            return intermediate * (_baseReward / divisibleUnits);
        }
    }

    function addUser(address _who, uint256 _value, uint256 _currentEpoch) internal {
        uint256 _currentBlocknum = externalToInternalBlockNumber(currentExternalBlock());
        uint256 adjustment = 0;
        if (_currentBlocknum == lastMinedBlock) {
            adjustment = 1;
        }

        users[_who].epoch = _currentEpoch;
        // Evenly divide the attempt over the remaining blocks in this epoch
        uint256 _currentRemaining = remainingEpochBlocks(_currentEpoch);
        // This is a race condition on mining
        if (_currentRemaining > 0) {
            _currentRemaining -= adjustment;
        }
        uint256 _splitAttempt = _value / _currentRemaining;
        uint256 _currentEpochAttempt = _splitAttempt * _currentRemaining;

        users[_who].totalAttempt = _currentEpochAttempt;
        users[_who].partialAttempt = _splitAttempt;
        users[_who].isCreated = true;
        users[_who].isRedeemed = false;
    }

    function adjustEpoch(uint256 _epochNumber, uint256 _currentAttempt, uint256 _partialAttempt) internal {
        // Now that we have a user entry we need to calculate a new adjusted unit for the current and next epoch
        epochs[_epochNumber].totalAttempt += _currentAttempt;
        // Adjust the unit for each attempt period
        epochs[_epochNumber].adjustedUnit += _partialAttempt;
    }

    function calculateMinimumContribution() public constant returns (uint256)  {
        return baseContract.currentDifficultyWei() / 10000000 * contractPeriod;
    }

    event LogEvent(
        string _info,
        uint256 _extra
    );

    function () payable {
     
       require(msg.value >= calculateMinimumContribution());

       // Max bet to 
       if (msg.value > maxBet) {
          // Pool is going to reject this bet
          revert();
       }

       // This is so the pool can be closed for maintenance
       if (isPaused) {
           revert();
       }

       uint256 _currentEpoch = currentEpoch();

       if (users[msg.sender].isCreated) {
            // The user entry exists
            // if the epoch is passed we need to roll the balance from that epoch to the user if it hasn't been done already
            // and treat it like a new epoch
            // We check for previous epoch and leeway into next epoch to prevent race condition on claim
            if (users[msg.sender].epoch < _currentEpoch && (remainingEpochBlocks(users[msg.sender].epoch+1) < 98)) {
                // The user's last betting period is over
                // Let's add to the user's balance
                epoch storage ep = epochs[users[msg.sender].epoch];
                uint256 _balance = calculateProportionalReward(ep.totalClaimed,
                                                                users[msg.sender].totalAttempt,
                                                                ep.totalAttempt);
                users[msg.sender].balance += _balance;

                // Let's redeem the users balance
                doRedemption(msg.sender);

                // Ok now we need to create a completely new user entry
                addUser(msg.sender, msg.value, _currentEpoch);
                adjustEpoch(_currentEpoch,
                            users[msg.sender].totalAttempt,
                            users[msg.sender].partialAttempt);
            } else {
                // We are currently in the Epoch
                // Users cannot adjust the current bet or redeem
                // This is just to keep the code simple in this version of GaoPool
                // Additional bets can bet made on other accounts
                revert();
            }
        } else {
            // No entry exists for this user, so first time new attempt
            addUser(msg.sender, msg.value, _currentEpoch);
            adjustEpoch(_currentEpoch,
                         users[msg.sender].totalAttempt,
                         users[msg.sender].partialAttempt);
        }
    }

    function bteBlockToEpoch(uint256 _blockNumber) constant returns (uint256) {
       return (_blockNumber / contractPeriod);
    }

    function doRedemption(address _who) internal {
        uint256 balance = users[_who].balance;
        if (balance > 0) {
            uint256 ownerCut = (balance / 100) * poolPercentage;
            uint256 remainder = balance - ownerCut;
            if (ownerCut > 0) {
                baseContract.transfer(owner, ownerCut);
            }
            baseContract.transfer(_who, remainder);
            users[_who].balance = 0;
            users[_who].isRedeemed = true;
        }
    }

    function redeem() external nonReentrant {
        uint256 _currentEpoch = currentEpoch();
        uint256 _userEpoch = users[msg.sender].epoch;
        if (_userEpoch < _currentEpoch && (remainingEpochBlocks(_userEpoch+1) < 98) ) {
            require(!users[msg.sender].isRedeemed);

            epoch storage ep = epochs[_userEpoch];
            uint256 _balance = calculateProportionalReward(ep.totalClaimed,
                                                             users[msg.sender].totalAttempt,
                                                             ep.totalAttempt);
            users[msg.sender].balance += _balance;
            doRedemption(msg.sender);
        }
    }

    function mine() external nonReentrant {
        // Did someone already try to mine this block?
        uint256 _blockNum = externalToInternalBlockNumber(currentExternalBlock());
        require(!baseContract.checkMiningAttempt(_blockNum, this));

        // Get the current epoch information
        uint256 _epoch = currentEpoch();
        epoch storage e = epochs[_epoch];
        if (e.adjustedUnit > 0) {
            e.actualAttempt += e.adjustedUnit;
            // Now we have a total contribution amount
            baseContract.mine.value(e.adjustedUnit)();
            e.minedBlocks += 1;
        }
        lastMinedBlock = _blockNum;
    }

    function claim(uint256 _blockNumber, address forCreditTo) nonReentrant external returns (bool) {
        // Did we win the block in question
        require(baseContract.checkWinning(_blockNumber));

        uint256 initialBalance = baseContract.balanceOf(this);

        // We won let's get our reward
        baseContract.claim(_blockNumber, this);

        uint256 balance = baseContract.balanceOf(this);

        // What Epoch does this block fall into
        uint256 _epoch = bteBlockToEpoch(_blockNumber);
        epoch storage e = epochs[_epoch];
        e.totalClaimed += (balance - initialBalance);
        e.claimedBlocks += 1;
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
            uint256 _balance = calculateProportionalReward(ep.totalClaimed,
                                                             users[_addr].totalAttempt,
                                                             ep.totalAttempt);
            return _balance;
        } else {
            // User does not exist
            return 0;
        }
    }

    function poolSetPercentage(uint8 _percentage) external nonReentrant onlyOwner {
        // Just in case owner is compromised
        require(_percentage < maxPoolPercentage);
        poolPercentage = _percentage;
    }

    function poolSetPaused(bool _paused) external nonReentrant onlyOwner {
        isPaused = _paused;
    }

    function poolSetMaxBet(uint256 _value) external nonReentrant onlyOwner {
        maxBet = _value;
    }

    function findContribution(address _who) constant external returns (uint256, uint256, uint256, uint256) {
        user storage u = users[_who];
        if (u.isCreated) {
            return (u.epoch, u.partialAttempt, u.totalAttempt, u.balance);
        } else {
            return (0,0,0,0);
        }
    }

    function checkMiningAttempt(uint256 _blockNum, address _sender) constant public returns (bool) {
        return baseContract.checkMiningAttempt(_blockNum, _sender);
    }
    
    function checkWinning(uint256 _blockNum) constant public returns (bool) {
        return baseContract.checkWinning(_blockNum);
    }

}