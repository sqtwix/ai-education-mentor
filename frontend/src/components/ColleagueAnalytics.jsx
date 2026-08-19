import React, { useState, useEffect, useMemo } from "react";
import { Users, BarChart3, TrendingUp, Award, CheckCircle2, Shield, Search } from "lucide-react";
import { getBenchmarks } from "../api";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, PieChart, Pie, Cell } from "recharts";

export function ColleagueAnalytics() {
  const [benchmarksData, setBenchmarksData] = useState({});
  const [selectedPosition, setSelectedPosition] = useState("Главный специалист");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function loadBenchmarks() {
      try {
        setIsLoading(true);
        const data = await getBenchmarks();
        setBenchmarksData(data?.benchmarks_by_position || {});
      } catch (err) {
        console.error("Failed to load benchmarks:", err);
      } finally {
        setIsLoading(false);
      }
    }
    loadBenchmarks();
  }, []);

  const positionsList = Object.keys(benchmarksData);

  const currentPosData = benchmarksData[selectedPosition] || {
    total_employees: 0,
    total_records: 0,
    courses: {},
  };

  const topCourses = useMemo(() => {
    const courses = Object.values(currentPosData.courses || {});
    return courses
      .sort((a, b) => (b.popularity_pct || 0) - (a.popularity_pct || 0))
      .slice(0, 10);
  }, [currentPosData]);

  const chartData = topCourses.map((c) => ({
    name: c.course_name.length > 28 ? c.course_name.slice(0, 26) + "..." : c.course_name,
    fullName: c.course_name,
    popularity: c.popularity_pct,
    success: c.success_rate || 100,
    totalTaken: c.total_taken,
  }));

  const pieData = useMemo(() => {
    const courses = Object.values(currentPosData.courses || {});
    let passed = 0;
    let failed = 0;
    let inProgress = 0;
    courses.forEach((c) => {
      passed += c.passed || 0;
      failed += c.failed || 0;
      inProgress += c.in_progress || 0;
    });
    return [
      { name: "Пройден", value: passed, color: "#1b559b" },
      { name: "Не пройден", value: failed, color: "#ef4444" },
      { name: "В процессе", value: inProgress, color: "#f59e0b" },
    ].filter((item) => item.value > 0);
  }, [currentPosData]);

  return (
    <div className="analytics-container">
      <div className="analytics-header-card">
        <div className="analytics-header-title">
          <BarChart3 size={24} className="text-primary" />
          <div>
            <h3>Аналитика истории обучения и бенчмаркинг по должностям</h3>
            <p className="muted">
              Статистика востребованности и успешности образовательных программ на основе реестра 1315 обучений
            </p>
          </div>
        </div>

        <div className="position-select-box">
          <label className="form-label">Выберите должность ГГС для анализа:</label>
          <select
            className="form-select"
            value={selectedPosition}
            onChange={(e) => setSelectedPosition(e.target.value)}
          >
            {positionsList.map((pos, idx) => (
              <option key={idx} value={pos}>
                {pos} ({benchmarksData[pos]?.total_employees || 0} сотрудников)
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Карточки KPI по должности */}
      <div className="kpi-cards-grid">
        <div className="kpi-card">
          <div className="kpi-icon-box bg-blue">
            <Users size={20} />
          </div>
          <div>
            <div className="kpi-val">{currentPosData.total_employees}</div>
            <div className="kpi-lbl">Сотрудников в базе</div>
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-icon-box bg-green">
            <Award size={20} />
          </div>
          <div>
            <div className="kpi-val">{currentPosData.total_records}</div>
            <div className="kpi-lbl">Пройденных курсов</div>
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-icon-box bg-purple">
            <TrendingUp size={20} />
          </div>
          <div>
            <div className="kpi-val">{Object.keys(currentPosData.courses || {}).length}</div>
            <div className="kpi-lbl">Уникальных программ</div>
          </div>
        </div>
      </div>

      {/* Графики */}
      <div className="charts-grid-layout">
        {/* Столбчатый график: Топ курсов по востребованности */}
        <div className="chart-card-full">
          <h4>Топ-10 востребованных курсов для должности «{selectedPosition}»</h4>
          <p className="muted text-sm mb-3">Процент сотрудников данной должности, прошедших курс:</p>
          
          <div className="bar-chart-wrapper" style={{ height: 320 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} layout="vertical" margin={{ left: 10, right: 30, top: 10, bottom: 10 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
                <XAxis type="number" domain={[0, 100]} unit="%" tick={{ fontSize: 11 }} />
                <YAxis dataKey="name" type="category" width={180} tick={{ fontSize: 11 }} />
                <Tooltip
                  formatter={(value, name) => [`${value}%`, name === "popularity" ? "Востребованность" : "Успешность"]}
                  labelFormatter={(label, payload) => payload?.[0]?.payload?.fullName || label}
                />
                <Bar dataKey="popularity" fill="#1b559b" radius={[0, 4, 4, 0]} name="Востребованность" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Круговая диаграмма: Успешность сдачи */}
        {pieData.length > 0 && (
          <div className="chart-card-side">
            <h4>Статусы завершения программ</h4>
            <div style={{ height: 240 }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label>
                    {pieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="pie-legend-row">
              {pieData.map((item, idx) => (
                <div key={idx} className="pie-legend-item">
                  <span className="dot" style={{ backgroundColor: item.color }} />
                  <span>{item.name}: <strong>{item.value}</strong></span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
