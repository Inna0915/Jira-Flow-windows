import { useState, useEffect, useCallback } from 'react';
import { 
  Database, 
  Search, 
  Plus, 
  Edit2, 
  Trash2, 
  ChevronLeft, 
  ChevronRight,
  Table,
  RefreshCw,
  Save,
  X
} from 'lucide-react';
import { toast } from 'sonner';

type TableName = 't_tasks' | 't_work_logs';

interface ColumnInfo {
  name: string;
  type: string;
}

interface QueryResult {
  columns: string[];
  rows: any[];
  total: number;
}

export function History() {
  const [activeTable, setActiveTable] = useState<TableName>('t_tasks');
  const [columns, setColumns] = useState<ColumnInfo[]>([]);
  const [data, setData] = useState<QueryResult>({ columns: [], rows: [], total: 0 });
  const [loading, setLoading] = useState(false);
  
  // Pagination
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [totalPages, setTotalPages] = useState(1);
  
  // Search
  const [searchColumn, setSearchColumn] = useState('');
  const [searchValue, setSearchValue] = useState('');
  
  // Edit modal
  const [editingRow, setEditingRow] = useState<any>(null);
  const [editForm, setEditForm] = useState<Record<string, any>>({});
  const [isCreateMode, setIsCreateMode] = useState(false);

  // Load table schema
  const loadSchema = useCallback(async () => {
    try {
      const result = await window.electronAPI.database.query(
        `PRAGMA table_info(${activeTable})`
      );
      if (result.success && Array.isArray(result.data)) {
        setColumns(result.data.map((col: any) => ({
          name: col.name,
          type: col.type
        })));
        // Set default search column to first column
        if (result.data.length > 0 && !searchColumn) {
          setSearchColumn(result.data[0].name);
        }
      }
    } catch (error) {
      console.error('Failed to load schema:', error);
    }
  }, [activeTable, searchColumn]);

  // Load table data with pagination
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const offset = (page - 1) * pageSize;
      
      // Build query with optional search
      let whereClause = '';
      let countWhereClause = '';
      const params: any[] = [];
      
      if (searchColumn && searchValue) {
        whereClause = `WHERE ${searchColumn} LIKE ?`;
        countWhereClause = `WHERE ${searchColumn} LIKE ?`;
        params.push(`%${searchValue}%`);
      }
      
      // Get total count
      const countResult = await window.electronAPI.database.query(
        `SELECT COUNT(*) as total FROM ${activeTable} ${countWhereClause}`,
        params
      );
      const total = countResult.success && Array.isArray(countResult.data) 
        ? (countResult.data[0]?.total || 0) 
        : 0;
      
      // Get data with limit/offset
      const dataParams = [...params, pageSize, offset];
      const dataResult = await window.electronAPI.database.query(
        `SELECT * FROM ${activeTable} ${whereClause} ORDER BY rowid DESC LIMIT ? OFFSET ?`,
        dataParams
      );
      
      if (dataResult.success && Array.isArray(dataResult.data)) {
        const rows = dataResult.data;
        const cols = rows.length > 0 ? Object.keys(rows[0]) : [];
        setData({ columns: cols, rows, total });
        setTotalPages(Math.ceil(total / pageSize));
      }
    } catch (error) {
      console.error('Failed to load data:', error);
      toast.error('加载数据失败');
    } finally {
      setLoading(false);
    }
  }, [activeTable, page, pageSize, searchColumn, searchValue]);

  useEffect(() => {
    loadSchema();
    setPage(1);
  }, [activeTable, loadSchema]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSearch = () => {
    setPage(1);
    loadData();
  };

  const handleClearSearch = () => {
    setSearchValue('');
    setPage(1);
    loadData();
  };

  const handleDelete = async (row: any) => {
    if (!confirm('确定要删除这条记录吗？此操作不可恢复。')) {
      return;
    }
    
    try {
      // Get primary key column (usually first column or 'key'/'id')
      const pkColumn = columns.find(c => 
        c.name.toLowerCase() === 'key' || 
        c.name.toLowerCase() === 'id' ||
        c.name.toLowerCase() === 'rowid'
      )?.name || columns[0]?.name;
      
      const pkValue = row[pkColumn];
      
      const result = await window.electronAPI.database.query(
        `DELETE FROM ${activeTable} WHERE ${pkColumn} = ?`,
        [pkValue]
      );
      
      if (result.success) {
        toast.success('删除成功');
        loadData();
      } else {
        toast.error('删除失败: ' + result.error);
      }
    } catch (error) {
      console.error('Failed to delete:', error);
      toast.error('删除失败');
    }
  };

  const openEditModal = (row: any) => {
    setEditingRow(row);
    setEditForm({ ...row });
    setIsCreateMode(false);
  };

  const openCreateModal = () => {
    setEditingRow({});
    // Initialize empty form with all columns
    const emptyForm: Record<string, any> = {};
    columns.forEach(col => {
      emptyForm[col.name] = '';
    });
    setEditForm(emptyForm);
    setIsCreateMode(true);
  };

  const closeEditModal = () => {
    setEditingRow(null);
    setEditForm({});
    setIsCreateMode(false);
  };

  const handleSave = async () => {
    try {
      if (isCreateMode) {
        // INSERT
        const colNames = Object.keys(editForm).filter(k => editForm[k] !== '');
        const placeholders = colNames.map(() => '?').join(', ');
        const values = colNames.map(k => editForm[k]);
        
        const result = await window.electronAPI.database.query(
          `INSERT INTO ${activeTable} (${colNames.join(', ')}) VALUES (${placeholders})`,
          values
        );
        
        if (result.success) {
          toast.success('创建成功');
          closeEditModal();
          loadData();
        } else {
          toast.error('创建失败: ' + result.error);
        }
      } else {
        // UPDATE
        const pkColumn = columns.find(c => 
          c.name.toLowerCase() === 'key' || 
          c.name.toLowerCase() === 'id' ||
          c.name.toLowerCase() === 'rowid'
        )?.name || columns[0]?.name;
        
        const pkValue = editingRow[pkColumn];
        
        // Build SET clause excluding primary key
        const updates = Object.keys(editForm)
          .filter(k => k !== pkColumn)
          .map(k => `${k} = ?`)
          .join(', ');
        const values = Object.keys(editForm)
          .filter(k => k !== pkColumn)
          .map(k => editForm[k]);
        
        const result = await window.electronAPI.database.query(
          `UPDATE ${activeTable} SET ${updates} WHERE ${pkColumn} = ?`,
          [...values, pkValue]
        );
        
        if (result.success) {
          toast.success('更新成功');
          closeEditModal();
          loadData();
        } else {
          toast.error('更新失败: ' + result.error);
        }
      }
    } catch (error) {
      console.error('Failed to save:', error);
      toast.error('保存失败');
    }
  };

  const formatCellValue = (value: any) => {
    if (value === null || value === undefined) return <span className="text-gray-400">NULL</span>;
    if (typeof value === 'object') return JSON.stringify(value).substring(0, 50);
    return String(value).substring(0, 100);
  };

  return (
    <div className="h-full flex flex-col bg-[#F4F5F7] p-4">
      {/* Header */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Database className="w-5 h-5 text-[#0052CC]" />
              <h1 className="text-lg font-semibold text-gray-900">历史数据管理</h1>
            </div>
            
            {/* Table selector */}
            <div className="flex bg-gray-100 rounded-lg p-1">
              <button
                onClick={() => setActiveTable('t_tasks')}
                className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  activeTable === 't_tasks'
                    ? 'bg-white text-[#0052CC] shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                <Table className="w-4 h-4 inline mr-1.5" />
                任务表 (t_tasks)
              </button>
              <button
                onClick={() => setActiveTable('t_work_logs')}
                className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  activeTable === 't_work_logs'
                    ? 'bg-white text-[#0052CC] shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                <Table className="w-4 h-4 inline mr-1.5" />
                日志表 (t_work_logs)
              </button>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            {/* Search */}
            <select
              value={searchColumn}
              onChange={(e) => setSearchColumn(e.target.value)}
              className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#0052CC] focus:border-[#0052CC]"
            >
              {columns.map(col => (
                <option key={col.name} value={col.name}>{col.name}</option>
              ))}
            </select>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={searchValue}
                onChange={(e) => setSearchValue(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                placeholder="搜索..."
                className="pl-9 pr-4 py-1.5 border border-gray-300 rounded-lg text-sm w-48 focus:ring-2 focus:ring-[#0052CC] focus:border-[#0052CC]"
              />
            </div>
            <button
              onClick={handleSearch}
              className="px-3 py-1.5 bg-[#0052CC] text-white rounded-lg text-sm hover:bg-[#0747A6] transition-colors"
            >
              搜索
            </button>
            {searchValue && (
              <button
                onClick={handleClearSearch}
                className="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            )}
            
            <div className="w-px h-6 bg-gray-300 mx-1" />
            
            <button
              onClick={openCreateModal}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700 transition-colors"
            >
              <Plus className="w-4 h-4" />
              新增
            </button>
            <button
              onClick={loadData}
              className="p-1.5 text-gray-500 hover:text-[#0052CC] hover:bg-blue-50 rounded-lg"
              title="刷新"
            >
              <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
        
        {/* Stats */}
        <div className="mt-3 pt-3 border-t border-gray-100 flex items-center gap-4 text-sm text-gray-500">
          <span>总记录: <strong className="text-gray-900">{data.total}</strong></span>
          <span>当前页: <strong className="text-gray-900">{data.rows.length}</strong></span>
          <span>表: <strong className="text-gray-900">{activeTable}</strong></span>
        </div>
      </div>

      {/* Data Table */}
      <div className="flex-1 bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden flex flex-col">
        <div className="flex-1 overflow-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 sticky top-0 z-10">
              <tr>
                <th className="px-4 py-3 text-left font-semibold text-gray-700 border-b w-20">操作</th>
                {data.columns.map(col => (
                  <th 
                    key={col} 
                    className="px-4 py-3 text-left font-semibold text-gray-700 border-b whitespace-nowrap"
                  >
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.rows.map((row, idx) => (
                <tr 
                  key={idx} 
                  className="border-b border-gray-100 hover:bg-blue-50/50 transition-colors"
                >
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => openEditModal(row)}
                        className="p-1 text-blue-600 hover:bg-blue-100 rounded"
                        title="编辑"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(row)}
                        className="p-1 text-red-600 hover:bg-red-100 rounded"
                        title="删除"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                  {data.columns.map(col => (
                    <td key={col} className="px-4 py-2 max-w-xs truncate" title={String(row[col])}>
                      {formatCellValue(row[col])}
                    </td>
                  ))}
                </tr>
              ))}
              {data.rows.length === 0 && (
                <tr>
                  <td colSpan={data.columns.length + 1} className="px-4 py-12 text-center text-gray-500">
                    {loading ? '加载中...' : '暂无数据'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        
        {/* Pagination */}
        <div className="px-4 py-3 border-t border-gray-200 bg-gray-50 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-600">
              第 {page} / {totalPages} 页
            </span>
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-600">每页:</span>
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setPage(1);
                }}
                className="px-2 py-1 border border-gray-300 rounded text-sm"
              >
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage(1)}
              disabled={page <= 1}
              className="px-3 py-1 border border-gray-300 rounded text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100"
            >
              首页
            </button>
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="p-1 border border-gray-300 rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="px-3 py-1 bg-[#0052CC] text-white rounded text-sm font-medium">
              {page}
            </span>
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="p-1 border border-gray-300 rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
            <button
              onClick={() => setPage(totalPages)}
              disabled={page >= totalPages}
              className="px-3 py-1 border border-gray-300 rounded text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100"
            >
              末页
            </button>
          </div>
        </div>
      </div>

      {/* Edit/Create Modal */}
      {editingRow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-xl shadow-2xl w-[600px] max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h2 className="text-lg font-semibold">
                {isCreateMode ? '新增记录' : '编辑记录'}
              </h2>
              <button onClick={closeEditModal} className="p-1 hover:bg-gray-100 rounded">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="flex-1 overflow-auto p-6">
              <div className="space-y-4">
                {columns.map(col => (
                  <div key={col.name}>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      {col.name}
                      <span className="ml-2 text-xs text-gray-400">({col.type})</span>
                    </label>
                    <input
                      type="text"
                      value={editForm[col.name] ?? ''}
                      onChange={(e) => setEditForm({ ...editForm, [col.name]: e.target.value })}
                      disabled={!isCreateMode && (col.name.toLowerCase() === 'key' || col.name.toLowerCase() === 'id' || col.name.toLowerCase() === 'rowid')}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#0052CC] focus:border-[#0052CC] disabled:bg-gray-100 disabled:text-gray-500"
                      placeholder={col.type === 'INTEGER' ? '数字' : '文本'}
                    />
                  </div>
                ))}
              </div>
            </div>
            
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t bg-gray-50">
              <button
                onClick={closeEditModal}
                className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg"
              >
                取消
              </button>
              <button
                onClick={handleSave}
                className="flex items-center gap-2 px-4 py-2 bg-[#0052CC] text-white rounded-lg hover:bg-[#0747A6]"
              >
                <Save className="w-4 h-4" />
                保存
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default History;
