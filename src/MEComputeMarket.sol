// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Finite compute orders settled in native MEC. Delivery is a provider claim,
/// not a proof of computation. Only the buyer can release escrow; an expired order
/// can be refunded even if the provider has recorded a receipt.
contract MEComputeMarket {
    struct Offer { address provider; bytes32 specHash; uint256 unitPrice; uint32 deliverySeconds; bool active; }
    enum State { Missing, Pending, Delivered, Accepted, Refunded }
    struct Order { address buyer; address provider; uint256 offerId; uint256 units; uint256 paid; uint64 deadline; bytes32 requestHash; bytes32 receiptHash; State state; }
    mapping(uint256 => Offer) public offers;
    mapping(uint256 => Order) public orders;
    mapping(address => uint256) public credits;
    uint256 public offerCount;
    uint256 public orderCount;
    uint256 public totalEscrow;
    uint256 private entered;

    event OfferCreated(uint256 indexed offerId, address indexed provider, bytes32 specHash, uint256 unitPrice, uint32 deliverySeconds);
    event OfferActive(uint256 indexed offerId, bool active);
    event Ordered(uint256 indexed orderId, uint256 indexed offerId, address indexed buyer, uint256 units, uint256 paid, uint64 deadline, bytes32 requestHash);
    event Delivered(uint256 indexed orderId, bytes32 receiptHash);
    event Accepted(uint256 indexed orderId);
    event Refunded(uint256 indexed orderId);
    event Withdrawn(address indexed account, address indexed recipient, uint256 amount);

    modifier lock() { require(entered == 0, "reentrant"); entered = 1; _; entered = 0; }

    function createOffer(bytes32 specHash, uint256 unitPrice, uint32 deliverySeconds) external returns (uint256 id) {
        require(specHash != bytes32(0) && unitPrice > 0, "invalid offer");
        require(deliverySeconds >= 60 && deliverySeconds <= 30 days, "invalid deadline");
        id = ++offerCount;
        offers[id] = Offer(msg.sender, specHash, unitPrice, deliverySeconds, true);
        emit OfferCreated(id, msg.sender, specHash, unitPrice, deliverySeconds);
    }
    function setOfferActive(uint256 id, bool active) external {
        require(msg.sender == offers[id].provider, "provider only");
        offers[id].active = active;
        emit OfferActive(id, active);
    }
    function order(uint256 offerId, uint256 units, bytes32 requestHash) external payable returns (uint256 id) {
        Offer memory offer = offers[offerId];
        require(offer.active && units > 0 && units <= 10000 && requestHash != bytes32(0), "invalid order");
        require(msg.value == offer.unitPrice * units, "exact payment required");
        id = ++orderCount;
        uint64 deadline = uint64(block.timestamp + offer.deliverySeconds);
        orders[id] = Order(msg.sender, offer.provider, offerId, units, msg.value, deadline, requestHash, bytes32(0), State.Pending);
        totalEscrow += msg.value;
        emit Ordered(id, offerId, msg.sender, units, msg.value, deadline, requestHash);
    }
    function deliver(uint256 id, bytes32 receiptHash) external {
        Order storage item = orders[id];
        require(msg.sender == item.provider, "provider only");
        require(item.state == State.Pending && block.timestamp < item.deadline && receiptHash != bytes32(0), "not deliverable");
        item.receiptHash = receiptHash;
        item.state = State.Delivered;
        emit Delivered(id, receiptHash);
    }
    function accept(uint256 id) external {
        Order storage item = orders[id];
        require(msg.sender == item.buyer, "buyer only");
        require(item.state == State.Delivered && block.timestamp < item.deadline, "not acceptable");
        item.state = State.Accepted;
        totalEscrow -= item.paid;
        credits[item.provider] += item.paid;
        emit Accepted(id);
    }
    function refund(uint256 id) external {
        Order storage item = orders[id];
        require(msg.sender == item.buyer, "buyer only");
        require((item.state == State.Pending || item.state == State.Delivered) && block.timestamp >= item.deadline, "not refundable");
        item.state = State.Refunded;
        totalEscrow -= item.paid;
        credits[item.buyer] += item.paid;
        emit Refunded(id);
    }
    /// @dev Pull payments isolate failed recipients from order settlement.
    function withdraw(address payable recipient) external lock {
        uint256 amount = credits[msg.sender];
        require(amount > 0 && recipient != address(0), "no credit or recipient");
        credits[msg.sender] = 0;
        (bool ok,) = recipient.call{value: amount}("");
        require(ok, "transfer failed");
        emit Withdrawn(msg.sender, recipient, amount);
    }
}
