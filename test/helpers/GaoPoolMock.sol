pragma solidity ^0.4.13;

import '../../contracts/SharkPool.sol';

/**
 * @title Bitcoineum Mocking framework
 * @dev exposes functionality for tests
 * @dev specifically playing with block advancement
 */


contract SharkPoolMock is SharkPool {

  address bitcoineum_contract_address;
  uint256 current_block = 1;

  function current_external_block() public constant returns (uint256) {
     return current_block;
  }

  function set_block(uint256 _blockNumber) {
     current_block = _blockNumber;
  }

  function get_bitcoineum_contract_address() public constant returns (address) {
     return bitcoineum_contract_address;
  }

  function set_bitcoineum_contract_address(address _addr) public {
    bitcoineum_contract_address = _addr;
    base_contract = BitcoineumInterface(get_bitcoineum_contract_address());
  }

  function set_total_users(uint256 _totalUsers) public {
    total_users = _totalUsers;
  }

  // Directly mock internal functions

  function do_allocate_slot(address _who) public {
     allocate_slot(_who);
  }

}


