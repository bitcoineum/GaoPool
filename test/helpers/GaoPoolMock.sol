pragma solidity ^0.4.13;

import '../../contracts/GaoPool.sol';

/**
 * @title Bitcoineum Mocking framework
 * @dev exposes functionality for tests
 * @dev specifically playing with block advancement
 */


contract GaoPoolMock is GaoPool {

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

}


