export const resolveReportTrajectoryForExport = (report) => (
  report?.result?.trajectory
  || report?.result?.courses_analysis?.[0]
  || report?.result
  || {}
);
