const hasStages = (value) => Boolean(value && Array.isArray(value.stages));

export const getBatchTrajectories = (result) => (
  Array.isArray(result?.courses_analysis)
    ? result.courses_analysis.filter(hasStages)
    : []
);

export const requiresExplicitBatchSelection = (result) => (
  !hasStages(result?.trajectory) && getBatchTrajectories(result).length > 1
);

export const resolveTrajectoryForDisplay = (result, selectedIndex = null) => {
  if (hasStages(result?.trajectory)) return result.trajectory;
  if (hasStages(result)) return result;

  const batch = getBatchTrajectories(result);
  if (batch.length === 1) return batch[0];
  if (batch.length > 1 && Number.isInteger(selectedIndex) && selectedIndex >= 0 && selectedIndex < batch.length) {
    return batch[selectedIndex];
  }
  return null;
};
