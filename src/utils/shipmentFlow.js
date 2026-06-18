const transitions = {
  AVAILABLE: ["PENDING"],
  PENDING: ["ASSIGNED"],
  ASSIGNED: ["PICKED_UP"],
  PICKED_UP: ["IN_TRANSIT"],
  IN_TRANSIT: ["DELIVERED"],
};

const canTransition = (current, next) => {
  return transitions[current]?.includes(next);
};

module.exports = { canTransition };
