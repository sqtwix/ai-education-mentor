const hasStages = (value) => Boolean(value && Array.isArray(value.stages));

export const resolveReportTrajectoriesForExport = (report) => {
  if (hasStages(report?.result?.trajectory)) return [report.result.trajectory];
  if (Array.isArray(report?.result?.courses_analysis)) {
    return report.result.courses_analysis.filter(hasStages);
  }
  if (hasStages(report?.result)) return [report.result];
  return [];
};

export const resolveReportTrajectoryForExport = (report) => (
  resolveReportTrajectoriesForExport(report)[0] || {}
);

export const resolveReportJsonForExport = (report) => report?.result || {};
