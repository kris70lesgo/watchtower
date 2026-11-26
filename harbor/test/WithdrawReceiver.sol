// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
interface IMarket {
    function order(uint256 offerId, uint256 units, bytes32 requestHash) external payable returns (uint256);
    function refund(uint256 orderId) external;
    function withdraw(address payable recipient) external;
}
contract WithdrawReceiver {
    bool public rejectPayment;
    bool public nestedWithdrawalBlocked;
    IMarket public market;
    function buy(IMarket target) external payable {
        market = target;
        target.order{value: msg.value}(1, 1, keccak256("request"));
    }
    function reclaim() external { market.refund(1); }
    function setReject(bool value) external { rejectPayment = value; }
    function payout() external { market.withdraw(payable(address(this))); }
    receive() external payable {
        require(!rejectPayment, "recipient rejects");
        (bool ok,) = address(market).call(abi.encodeWithSignature("withdraw(address)", address(this)));
        nestedWithdrawalBlocked = !ok;
    }
}
