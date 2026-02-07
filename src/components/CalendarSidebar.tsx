import { useState, useMemo, useCallback, useEffect } from 'react';
import { Solar } from 'lunar-javascript';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon } from 'lucide-react';

interface CalendarSidebarProps {
  selectedDate: Date;
  onSelectDate: (date: Date) => void;
  onSelectWeek: (weekStart: Date, weekEnd: Date) => void;
  onSelectMonth: (monthStart: Date, monthEnd: Date) => void;
  onSelectQuarter?: (quarterStart: Date, quarterEnd: Date) => void;
  onSelectYear?: (yearStart: Date, yearEnd: Date) => void;
  weekTaskStatus?: Record<string, boolean>;
  dayTaskStatus?: Record<string, boolean>;
}

const WEEKDAYS = ['一', '二', '三', '四', '五', '六', '日'];

// 获取周数 (ISO 8601)
function getWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

// 获取周开始（周一）
function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(d.setDate(diff));
}

// 获取周结束（周日）
function getWeekEnd(date: Date): Date {
  const start = getWeekStart(date);
  return new Date(start.getTime() + 6 * 24 * 60 * 60 * 1000);
}

// 格式化日期为本地 YYYY-MM-DD (避免时区问题)
function formatLocalDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// 判断是否是今天
function isToday(date: Date): boolean {
  const today = new Date();
  return date.getFullYear() === today.getFullYear() &&
         date.getMonth() === today.getMonth() &&
         date.getDate() === today.getDate();
}

// 判断是否是同一天
function isSameDay(date1: Date, date2: Date): boolean {
  return date1.getFullYear() === date2.getFullYear() &&
         date1.getMonth() === date2.getMonth() &&
         date1.getDate() === date2.getDate();
}

// 获取农历信息用于显示
function getLunarDisplay(date: Date): { text: string; isFestival: boolean; isTerm: boolean } {
  try {
    const solar = Solar.fromDate(date);
    const lunar = solar.getLunar();
    
    // 优先显示节日
    const solarFestivals = solar.getFestivals();
    const lunarFestivals = lunar.getFestivals();
    const festivals = [...solarFestivals, ...lunarFestivals].filter(Boolean);
    
    if (festivals.length > 0) {
      return { text: festivals[0], isFestival: true, isTerm: false };
    }
    
    // 其次显示节气
    const jieQi = lunar.getJieQi();
    if (jieQi) {
      return { text: jieQi, isFestival: false, isTerm: true };
    }
    
    // 默认显示农历日期
    const dayInChinese = lunar.getDayInChinese();
    return { text: dayInChinese, isFestival: false, isTerm: false };
  } catch {
    return { text: '', isFestival: false, isTerm: false };
  }
}

export function CalendarSidebar({
  selectedDate,
  onSelectDate,
  onSelectWeek,
  onSelectMonth,
  onSelectQuarter,
  onSelectYear,
  weekTaskStatus = {},
  dayTaskStatus = {},
}: CalendarSidebarProps) {
  const [viewDate, setViewDate] = useState(selectedDate);
  const [viewMode, setViewMode] = useState<'days' | 'months' | 'quarters' | 'years'>('days');

  // 同步外部 selectedDate
  useEffect(() => {
    setViewDate(selectedDate);
  }, [selectedDate]);

  // 获取当前视图日期的农历信息 (头部显示)
  const headerLunarInfo = useMemo(() => {
    try {
      const solar = Solar.fromDate(viewDate);
      const lunar = solar.getLunar();
      const festivals = [...solar.getFestivals(), ...lunar.getFestivals()].filter(Boolean);
      const jieQi = lunar.getJieQi();
      return { 
        yearInGanZhi: lunar.getYearInGanZhi(),
        monthInChinese: lunar.getMonthInChinese(),
        dayInChinese: lunar.getDayInChinese(),
        festivals,
        jieQi
      };
    } catch {
      return null;
    }
  }, [viewDate]);

  // 生成年份范围（当前年份前后5年）
  const yearRange = useMemo(() => {
    const currentYear = viewDate.getFullYear();
    return Array.from({ length: 11 }, (_, i) => currentYear - 5 + i);
  }, [viewDate]);

  // 月份列表
  const months = useMemo(() => 
    Array.from({ length: 12 }, (_, i) => i + 1), []
  );

  // 季度列表
  const quarters = useMemo(() => [
    { q: 1, label: '一季度', months: [0, 1, 2] },
    { q: 2, label: '二季度', months: [3, 4, 5] },
    { q: 3, label: '三季度', months: [6, 7, 8] },
    { q: 4, label: '四季度', months: [9, 10, 11] },
  ], []);

  // 生成日历数据
  const calendarData = useMemo(() => {
    const year = viewDate.getFullYear();
    const month = viewDate.getMonth();
    
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    
    // 调整为周一开始
    let startOffset = firstDay.getDay() - 1;
    if (startOffset === -1) startOffset = 6;
    
    const days: { date: Date; dayOfMonth: number; isCurrentMonth: boolean; weekNum: number; lunar: ReturnType<typeof getLunarDisplay> }[] = [];
    const weeks: number[] = [];
    
    // 上月日期
    for (let i = startOffset - 1; i >= 0; i--) {
      const date = new Date(year, month, -i);
      const weekNum = getWeekNumber(date);
      days.push({ 
        date, 
        dayOfMonth: date.getDate(), 
        isCurrentMonth: false, 
        weekNum,
        lunar: getLunarDisplay(date)
      });
      if (!weeks.includes(weekNum)) weeks.push(weekNum);
    }
    
    // 当月日期
    for (let i = 1; i <= lastDay.getDate(); i++) {
      const date = new Date(year, month, i);
      const weekNum = getWeekNumber(date);
      days.push({ 
        date, 
        dayOfMonth: i, 
        isCurrentMonth: true, 
        weekNum,
        lunar: getLunarDisplay(date)
      });
      if (!weeks.includes(weekNum)) weeks.push(weekNum);
    }
    
    // 下月日期（补全到周日）
    const endOffset = 7 - (days.length % 7);
    if (endOffset < 7) {
      for (let i = 1; i <= endOffset; i++) {
        const date = new Date(year, month + 1, i);
        const weekNum = getWeekNumber(date);
        days.push({ 
          date, 
          dayOfMonth: i, 
          isCurrentMonth: false, 
          weekNum,
          lunar: getLunarDisplay(date)
        });
        if (!weeks.includes(weekNum)) weeks.push(weekNum);
      }
    }
    
    return { days, weeks };
  }, [viewDate]);

  // 导航处理 - 确保 < > 按钮工作
  const handlePrev = useCallback(() => {
    setViewDate(prev => {
      if (viewMode === 'days') {
        return new Date(prev.getFullYear(), prev.getMonth() - 1, 1);
      } else if (viewMode === 'months') {
        return new Date(prev.getFullYear() - 1, 0, 1);
      } else if (viewMode === 'quarters') {
        return new Date(prev.getFullYear() - 1, 0, 1);
      } else if (viewMode === 'years') {
        return new Date(prev.getFullYear() - 10, 0, 1);
      }
      return prev;
    });
  }, [viewMode]);

  const handleNext = useCallback(() => {
    setViewDate(prev => {
      if (viewMode === 'days') {
        return new Date(prev.getFullYear(), prev.getMonth() + 1, 1);
      } else if (viewMode === 'months') {
        return new Date(prev.getFullYear() + 1, 0, 1);
      } else if (viewMode === 'quarters') {
        return new Date(prev.getFullYear() + 1, 0, 1);
      } else if (viewMode === 'years') {
        return new Date(prev.getFullYear() + 10, 0, 1);
      }
      return prev;
    });
  }, [viewMode]);

  // 选择日期 - 发送本地日期字符串给父组件 (避免时区bug)
  const handleSelectDay = useCallback((date: Date) => {
    onSelectDate(date);
  }, [onSelectDate]);

  const handleSelectWeekFromNum = useCallback((weekNum: number) => {
    const weekDays = calendarData.days.filter(d => d.weekNum === weekNum && d.isCurrentMonth);
    if (weekDays.length > 0) {
      const weekStart = getWeekStart(weekDays[0].date);
      const weekEnd = getWeekEnd(weekDays[0].date);
      onSelectWeek(weekStart, weekEnd);
    }
  }, [calendarData.days, onSelectWeek]);

  const handleSelectMonth = useCallback((month: number) => {
    const year = viewDate.getFullYear();
    const monthStart = new Date(year, month - 1, 1);
    const monthEnd = new Date(year, month, 0);
    onSelectMonth(monthStart, monthEnd);
    setViewMode('days');
    setViewDate(monthStart);
  }, [viewDate, onSelectMonth]);

  const handleSelectQuarter = useCallback((quarter: number) => {
    const year = viewDate.getFullYear();
    const startMonth = (quarter - 1) * 3;
    const quarterStart = new Date(year, startMonth, 1);
    const quarterEnd = new Date(year, startMonth + 3, 0);
    onSelectQuarter?.(quarterStart, quarterEnd);
    setViewMode('days');
    setViewDate(quarterStart);
  }, [viewDate, onSelectQuarter]);

  const handleSelectYear = useCallback((year: number) => {
    const yearStart = new Date(year, 0, 1);
    const yearEnd = new Date(year, 11, 31);
    onSelectYear?.(yearStart, yearEnd);
    setViewMode('days');
    setViewDate(yearStart);
  }, [onSelectYear]);

  const handleHeaderClick = useCallback(() => {
    if (viewMode === 'days') {
      setViewMode('months');
    } else if (viewMode === 'months') {
      setViewMode('quarters');
    } else if (viewMode === 'quarters') {
      setViewMode('years');
    }
  }, [viewMode]);

  // 获取某天是否有任务
  const hasDayTask = useCallback((date: Date) => {
    const key = formatLocalDateKey(date);
    return !!dayTaskStatus[key];
  }, [dayTaskStatus]);

  // 获取周是否有任务
  const hasWeekTask = useCallback((weekNum: number) => {
    const key = `${viewDate.getFullYear()}-W${weekNum}`;
    const result = !!weekTaskStatus[key];
    console.log(`[Calendar] Checking ${key}: ${result ? 'YES' : 'NO'}`, weekTaskStatus);
    return result;
  }, [weekTaskStatus, viewDate]);

  return (
    <div className="w-[370px] bg-white flex flex-col h-full select-none border-r border-[#EBECF0]">
      {/* Header - 显示农历和当前视图 */}
      <div className="px-4 py-3 border-b border-[#EBECF0]">
        {/* 农历信息 */}
        {headerLunarInfo && (
          <div className="text-xs text-[#6B778C] mb-2 truncate">
            <span className="text-[#8B7355]">{headerLunarInfo.yearInGanZhi}年</span>
            <span className="mx-1">·</span>
            <span>{headerLunarInfo.monthInChinese}月{headerLunarInfo.dayInChinese}</span>
            {headerLunarInfo.festivals.length > 0 && (
              <span className="ml-2 text-[#0052CC] font-medium">{headerLunarInfo.festivals[0]}</span>
            )}
            {headerLunarInfo.jieQi && headerLunarInfo.festivals.length === 0 && (
              <span className="ml-2 text-[#36B37E]">{headerLunarInfo.jieQi}</span>
            )}
          </div>
        )}
        
        {/* 导航栏 - 年份和月份切换 */}
        <div className="flex items-center justify-between gap-1">
          {/* 上一年 */}
          <button
            onClick={() => setViewDate(prev => new Date(prev.getFullYear() - 1, prev.getMonth(), 1))}
            className="px-1.5 py-1.5 hover:bg-[#F4F5F7] rounded-lg transition-colors active:bg-[#EBECF0] text-[#6B778C] text-xs font-bold"
            type="button"
            title="上一年"
          >
            {'<<'}
          </button>
          
          {/* 上一月 */}
          <button
            onClick={handlePrev}
            className="p-1.5 hover:bg-[#F4F5F7] rounded-lg transition-colors active:bg-[#EBECF0]"
            type="button"
            title="上一月"
          >
            <ChevronLeft className="w-4 h-4 text-[#6B778C]" />
          </button>
          
          {/* 年月标题 */}
          <button
            onClick={handleHeaderClick}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg hover:bg-[#F4F5F7] transition-colors font-medium text-[#172B4D] text-sm"
            type="button"
          >
            <CalendarIcon className="w-4 h-4 text-[#0052CC]" />
            {viewMode === 'days' && viewDate.getFullYear() + '年' + (viewDate.getMonth() + 1) + '月'}
            {viewMode === 'months' && viewDate.getFullYear() + '年'}
            {viewMode === 'quarters' && viewDate.getFullYear() + '年'}
            {viewMode === 'years' && yearRange[0] + '-' + yearRange[yearRange.length - 1]}
          </button>
          
          {/* 下一月 */}
          <button
            onClick={handleNext}
            className="p-1.5 hover:bg-[#F4F5F7] rounded-lg transition-colors active:bg-[#EBECF0]"
            type="button"
            title="下一月"
          >
            <ChevronRight className="w-4 h-4 text-[#6B778C]" />
          </button>
          
          {/* 下一年 */}
          <button
            onClick={() => setViewDate(prev => new Date(prev.getFullYear() + 1, prev.getMonth(), 1))}
            className="px-1.5 py-1.5 hover:bg-[#F4F5F7] rounded-lg transition-colors active:bg-[#EBECF0] text-[#6B778C] text-xs font-bold"
            type="button"
            title="下一年"
          >
            {'>>'}
          </button>
        </div>
      </div>

      {/* 日历内容 */}
      <div className="flex-1 overflow-auto">
        {/* 日视图 */}
        {viewMode === 'days' && (
          <div className="p-3">
            {/* 周标题 + 周数 */}
            <div className="flex mb-2">
              <div className="w-10 text-xs text-[#6B778C] font-medium text-center">周</div>
              <div className="flex-1 grid grid-cols-7">
                {WEEKDAYS.map(day => (
                  <div key={day} className="text-xs text-[#6B778C] font-medium text-center py-1">
                    {day}
                  </div>
                ))}
              </div>
            </div>

            {/* 日历网格 - 无网格线 */}
            <div className="space-y-1">
              {Array.from({ length: Math.ceil(calendarData.days.length / 7) }).map((_, rowIndex) => {
                const weekDays = calendarData.days.slice(rowIndex * 7, (rowIndex + 1) * 7);
                const weekNum = weekDays[0]?.weekNum;
                const isWeekWithTask = hasWeekTask(weekNum);
                
                return (
                  <div key={rowIndex} className="flex items-center">
                    {/* 周数 - 可点击 */}
                    <button
                      onClick={() => handleSelectWeekFromNum(weekNum)}
                      className={`w-10 text-xs text-center py-2 rounded transition-colors relative ${
                        isWeekWithTask 
                          ? 'text-[#0052CC] font-semibold bg-[#DEEBFF] hover:bg-[#B3D4FF]' 
                          : 'text-[#6B778C] hover:bg-[#F4F5F7]'
                      }`}
                      type="button"
                    >
                      {weekNum}
                      {isWeekWithTask && (
                        <span className="absolute -bottom-0.5 left-1/2 transform -translate-x-1/2 w-1 h-1 bg-[#0052CC] rounded-full"></span>
                      )}
                    </button>
                    
                    {/* 日期 */}
                    <div className="flex-1 grid grid-cols-7 gap-1">
                      {weekDays.map(({ date, dayOfMonth, isCurrentMonth, lunar }, dayIndex) => {
                        const isSelected = isSameDay(date, selectedDate);
                        const isTodayDate = isToday(date);
                        const hasTask = hasDayTask(date);
                        const isWeekend = dayIndex >= 5;
                        
                        return (
                          <button
                            key={dayIndex}
                            onClick={() => handleSelectDay(date)}
                            className={`
                              relative h-14 flex flex-col items-center justify-center rounded-lg transition-all
                              ${isSelected ? 'bg-[#0052CC] text-white' : 'hover:bg-[#F4F5F7]'}
                              ${!isCurrentMonth && !isSelected ? 'text-[#97A0AF]' : ''}
                              ${isCurrentMonth && !isSelected ? (isWeekend ? 'text-[#DE350B]' : 'text-[#172B4D]') : ''}
                            `}
                            type="button"
                          >
                            {/* 今天指示器 - 蓝色圆环 + "今" 徽章 */}
                            {isTodayDate && (
                              <>
                                <div className={`absolute inset-0 rounded-lg ${isSelected ? 'ring-2 ring-white' : 'ring-2 ring-[#0052CC]'}`} />
                                <span className={`absolute -top-1 -right-1 text-[10px] px-1 rounded-full ${isSelected ? 'bg-white text-[#0052CC]' : 'bg-[#0052CC] text-white'}`}>
                                  今
                                </span>
                              </>
                            )}
                            
                            {/* 日期数字 */}
                            <span className={`text-sm ${isTodayDate && !isSelected ? 'font-bold text-[#0052CC]' : ''}`}>
                              {dayOfMonth}
                            </span>
                            
                            {/* 农历/节日/节气显示 */}
                            <span className={`text-[10px] mt-0.5 truncate max-w-full px-1 ${
                              isSelected 
                                ? 'text-white/80' 
                                : lunar.isFestival 
                                  ? 'text-[#0052CC] font-medium' 
                                  : lunar.isTerm 
                                    ? 'text-[#36B37E]'
                                    : 'text-[#97A0AF]'
                            }`}>
                              {lunar.text}
                            </span>
                            
                            {/* 任务圆点 - 显示在日期下方 */}
                            {hasTask && (
                              <div className={`w-1.5 h-1.5 rounded-full mt-0.5 ${
                                isSelected ? 'bg-white' : 'bg-[#0052CC]'
                              }`} />
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* 月视图 */}
        {viewMode === 'months' && (
          <div className="p-4 grid grid-cols-3 gap-3">
            {months.map(month => (
              <button
                key={month}
                onClick={() => handleSelectMonth(month)}
                className={`
                  py-4 px-2 rounded-lg text-center transition-colors
                  ${month === viewDate.getMonth() + 1 
                    ? 'bg-[#0052CC] text-white' 
                    : 'hover:bg-[#F4F5F7] text-[#172B4D]'
                  }
                `}
                type="button"
              >
                <span className="text-lg font-medium">{month}月</span>
              </button>
            ))}
          </div>
        )}

        {/* 季度视图 */}
        {viewMode === 'quarters' && (
          <div className="p-4 space-y-3">
            {quarters.map(({ q, label, months }) => (
              <button
                key={q}
                onClick={() => handleSelectQuarter(q)}
                className="w-full py-4 px-4 rounded-lg hover:bg-[#F4F5F7] transition-colors text-left"
                type="button"
              >
                <span className="text-lg font-medium text-[#172B4D]">{label}</span>
                <span className="text-sm text-[#6B778C] ml-3">
                  {months[0] + 1}月 - {months[2] + 1}月
                </span>
              </button>
            ))}
          </div>
        )}

        {/* 年视图 */}
        {viewMode === 'years' && (
          <div className="p-4 grid grid-cols-3 gap-3">
            {yearRange.map(year => (
              <button
                key={year}
                onClick={() => handleSelectYear(year)}
                className={`
                  py-4 px-2 rounded-lg text-center transition-colors
                  ${year === viewDate.getFullYear() 
                    ? 'bg-[#0052CC] text-white' 
                    : 'hover:bg-[#F4F5F7] text-[#172B4D]'
                  }
                `}
                type="button"
              >
                <span className="text-lg font-medium">{year}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* 快速导航 */}
      <div className="px-4 py-3 border-t border-[#EBECF0]">
        <button
          onClick={() => {
            const now = new Date();
            setViewDate(now);
            onSelectDate(now);
            setViewMode('days');
          }}
          className="w-full py-2 px-3 rounded-lg bg-[#F4F5F7] hover:bg-[#EBECF0] text-[#172B4D] text-sm font-medium transition-colors flex items-center justify-center gap-2"
          type="button"
        >
          <span className="w-2 h-2 rounded-full bg-[#0052CC]" />
          回到今天
        </button>
      </div>
    </div>
  );
}
