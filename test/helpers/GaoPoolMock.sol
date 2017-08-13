pragma solidity ^0.4.13;

import '../../contracts/GaoPool.sol';

/**
 * @title Bitcoineum Mocking framework
 * @dev exposes functionality for tests
 * @dev specifically playing with block advancement
 */


contract GaoPoolMock is GaoPool {

  address bitcoineumContractAddress;
  uint256 currentBlock = 1;

  function currentExternalBlock() public constant returns (uint256) {
     return currentBlock;
  }

  function setBlock(uint256 _blockNumber) {
     currentBlock = _blockNumber;
  }

  function getBitcoineumContractAddress() public constant returns (address) {
     return bitcoineumContractAddress;
  }

  function setBitcoineumContractAddress(address _addr) public {
    bitcoineumContractAddress = _addr;
    baseContract = BitcoineumInterface(getBitcoineumContractAddress());
  }

}


