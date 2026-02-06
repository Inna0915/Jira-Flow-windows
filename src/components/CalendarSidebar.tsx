import { useState, useMemo } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { 
  format, 
  startOfMonth, 
  endOfMonth, 
  startOfWeek, 
  endOfWeek, 
  addDays, 
  isSameMonth, 
  isSameDay, 
  addMonths,
  subMonths
} from 'date-fns';
import { Solar, Lunar } from 'lunar-javascript';

interface CalendarSidebarProps {
  selectedDate: Date;
  onSelect: (date: Date) => void;
}

// 农历节日映射
const LUNAR_FESTIVALS: Record<string, string> = {
  '正月初一': '春节',
  '正月十五': '元宵',
  '五月初五': '端午',
  '七月初七': '七夕',
  '八月十五': '中秋',
  '九月初九': '重阳',
  '腊月初八': '腊八',
  '腊月廿三': '小年',
  '腊月廿四': '小年',
  '腊月三十': '除夕',
  '腊月廿九': '除夕',
};

// 公历节日映射
const SOLAR_FESTIVALS: Record<string, string> = {
  '01-01': '元旦',
  '02-14': '情人',
  '03-08': '妇女',
  '04-01': '愚人',
  '05-01': '劳动',
  '06-01': '儿童',
  '07-01': '建党',
  '08-01': '建军',
  '09-10': '教师',
  '10-01': '国庆',
  '10-24': '程序',
  '11-11': '光棍',
  '12-24': '圣诞',
  '12-25': '圣诞',
};

// 获取节气
function getSolarTerm(date: Date): string | null {
  try {
    const solar = Solar.fromYmd(date.getFullYear(), date.getMonth() + 1, date.getDate());
    const jieQi = solar.getJieQi();
    return jieQi || null;
  } catch {
    return null;
  }
}

export function CalendarSidebar({ selectedDate, onSelect }: CalendarSidebarProps) {
  const [currentMonth, setCurrentMonth] = useState(selectedDate);

  // 获取农历日期信息
  const getLunarInfo = (date: Date): { day: string; festival: string | null; isTerm: boolean } => {
    try {
      const lunar = Lunar.fromDate(date);
      const lunarDay = lunar.getDayInChinese();
      const lunarMonth = lunar.getMonthInChinese();
      const lunarFull = `${lunarMonth}${lunarDay}`;
      
      // 检查农历节日
      let festival = LUNAR_FESTIVALS[lunarFull] || null;
      
      // 检查公历节日
      const solarKey = format(date, 'MM-dd');
      if (!festival && SOLAR_FESTIVALS[solarKey]) {
        festival = SOLAR_FESTIVALS[solarKey];
      }
      
      // 检查节气
      const term = getSolarTerm(date);
      const isTerm = !!term;
      
      return { 
        day: festival || term || lunarDay, 
        festival, 
        isTerm 
      };
    } catch {
      return { day: '', festival: null, isTerm: false };
    }
  };

  // 生成日历网格数据
  const calendarDays = useMemo(() => {
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(monthStart);
    const calendarStart = startOfWeek(monthStart, { weekStartsOn: 0 });
    const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });

    const days: Array<{
      date: Date;
      isCurrentMonth: boolean;
      isToday: boolean;
      isSelected: boolean;
      lunar: string;
      isFestival: boolean;
      isTerm: boolean;
    }> = [];

    let day = calendarStart;
    while (day <= calendarEnd) {
      const lunarInfo = getLunarInfo(day);
      days.push({
        date: new Date(day),
        isCurrentMonth: isSameMonth(day, monthStart),
        isToday: isSameDay(day, new Date()),
        isSelected: isSameDay(day, selectedDate),
        lunar: lunarInfo.day,
        isFestival: !!lunarInfo.festival,
        isTerm: lunarInfo.isTerm,
      });
      day = addDays(day, 1);
    }

    return days;
  }, [currentMonth, selectedDate]);

  const weekDays = ['日', '一', '二', '三', '四', '五', '六'];

  // 获取当前选中的农历日期显示
  const selectedLunarInfo = useMemo(() => {
    try {
      const lunar = Lunar.fromDate(selectedDate);
      const ganZhi = lunar.getYearInGanZhi();
      const zodiac = lunar.getYearShengXiao();
      const month = lunar.getMonthInChinese();
      const day = lunar.getDayInChinese();
      return `${ganZhi}年 (${zodiac}) ${month}月${day}`;
    } catch {
      return '';
    }
  }, [selectedDate]);

  return (
    <div className="flex flex-col h-full">
      {/* 月份导航 */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <button
          onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
          className="p-1 rounded hover:bg-gray-100 text-gray-600"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <div className="text-center">
          <div className="text-base font-semibold text-gray-900">
            {format(currentMonth, 'yyyy年MM月')}
          </div>
          <div className="text-xs text-gray-500">
            {selectedLunarInfo}
          </div>
        </div>
        <button
          onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
          className="p-1 rounded hover:bg-gray-100 text-gray-600"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>

      {/* 星期标题 */}
      <div className="grid grid-cols-7 border-b border-gray-100">
        {weekDays.map((day, i) => (
          <div
            key={day}
            className={`py-2 text-center text-xs font-medium ${
              i === 0 || i === 6 ? 'text-red-500' : 'text-gray-500'
            }`}
          >
            {day}
          </div>
        ))}
      </div>

      {/* 日期网格 */}
      <div className="flex-1 p-2">
        <div className="grid grid-cols-7 gap-1">
          {calendarDays.map((dayInfo, index) => {
            const dayOfWeek = index % 7;
            const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
            
            return (
              <button
                key={dayInfo.date.toISOString()}
                onClick={() => onSelect(dayInfo.date)}
                className={`
                  relative aspect-square flex flex-col items-center justify-center rounded-lg
                  transition-all duration-150
                  ${dayInfo.isSelected 
                    ? 'bg-[#0052CC] text-white shadow-md' 
                    : dayInfo.isToday
                    ? 'bg-[#DEEBFF] text-[#0052CC]'
                    : 'hover:bg-gray-50'
                  }
                  ${!dayInfo.isCurrentMonth && !dayInfo.isSelected ? 'text-gray-300' : ''}
                `}
              >
                {/* 公历日期 */}
                <span className={`
                  text-sm font-medium
                  ${dayInfo.isSelected 
                    ? 'text-white' 
                    : isWeekend && dayInfo.isCurrentMonth 
                    ? 'text-red-500' 
                    : 'text-gray-700'
                  }
                `}>
                  {format(dayInfo.date, 'd')}
                </span>
                
                {/* 农历/节日/节气 */}
                <span className={`
                  text-[10px] leading-tight truncate max-w-full px-1
                  ${dayInfo.isSelected 
                    ? 'text-white/90' 
                    : dayInfo.isFestival
                    ? 'text-red-500 font-medium'
                    : dayInfo.isTerm
                    ? 'text-[#0052CC]'
                    : isWeekend && dayInfo.isCurrentMonth
                    ? 'text-red-400'
                    : 'text-gray-400'
                  }
                `}>
                  {dayInfo.lunar}
                </span>
                
                {/* 今日指示点 */}
                {dayInfo.isToday && !dayInfo.isSelected && (
                  <div className="absolute bottom-1 w-1 h-1 rounded-full bg-[#0052CC]" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* 快速跳转 */}
      <div className="px-4 py-3 border-t border-gray-100 flex gap-2">
        <button
          onClick={() => {
            const today = new Date();
            setCurrentMonth(today);
            onSelect(today);
          }}
          className="flex-1 py-1.5 text-xs font-medium text-[#0052CC] bg-[#DEEBFF] rounded hover:bg-[#B3D4FF] transition-colors"
        >
          今天
        </button>
        <button
          onClick={() => onSelect(selectedDate)}
          className="flex-1 py-1.5 text-xs font-medium text-gray-600 bg-gray-100 rounded hover:bg-gray-200 transition-colors"
        >
          刷新
        </button>
      </div>
    </div>
  );
}

export default CalendarSidebar;
