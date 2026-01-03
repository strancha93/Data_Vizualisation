import React, { useState, useRef, useMemo, useEffect } from 'react';
import { Upload, FileJson, AlertCircle, Activity, Search, Plus, Database, User, LogOut, Trash2, Shield, Lock, ArrowRight, Users, UserPlus } from 'lucide-react';
import { FileStatus, ParsedDataset, SignalData, UserRole, StoredDatasetMetadata } from './types';
import { parseMatlabJson, filterBusTree } from './utils/dataProcessor';
import { saveDataset, getAllMetadata, getDataset, deleteDataset, isUserAuthorized } from './utils/storage';
import SignalTree from './components/SignalTree';
import ChartViewer from './components/ChartViewer';
import UserManagementModal from './components/UserManagementModal';
import { clsx } from 'clsx';

const MAX_SLOTS = 5;
const ADMIN_EMAIL = 'sebastien.tranchard@airbus.com';

const App: React.FC = () => {
  // Auth State
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<UserRole | null>(null);
  const [isAuthorizedTester, setIsAuthorizedTester] = useState(false);
  const [showUserModal, setShowUserModal] = useState(false);

  // App State
  const [status, setStatus] = useState<FileStatus>(FileStatus.IDLE);
  const [dataset, setDataset] = useState<ParsedDataset | null>(null);
  const [datasetName, setDatasetName] = useState<string>('');
  const [chartSlots, setChartSlots] = useState<SignalData[][]>(Array(MAX_SLOTS).fill([]));
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  
  // Storage State
  const [storedFiles, setStoredFiles] = useState<StoredDatasetMetadata[]>([]);
  const [isLoadingStorage, setIsLoadingStorage] = useState(false);

  // Global Cursors State
  const [cursor1, setCursor1] = useState<number | null>(null);
  const [cursor2, setCursor2] = useState<number | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const emailInputRef = useRef<HTMLInputElement>(null);

  // Load storage metadata on mount
  useEffect(() => {
    refreshStorageList();
  }, []);

  // Check authorization when email changes
  useEffect(() => {
    if (userEmail) {
        checkAuthorization(userEmail);
    } else {
        setIsAuthorizedTester(false);
    }
  }, [userEmail]);

  const checkAuthorization = async (email: string) => {
      // Admin is always authorized
      if (email.toLowerCase() === ADMIN_EMAIL.toLowerCase()) {
          setIsAuthorizedTester(true);
          return;
      }
      // Check storage for other users
      try {
          const authorized = await isUserAuthorized(email);
          setIsAuthorizedTester(authorized);
      } catch (e) {
          console.error("Failed to check authorization", e);
          setIsAuthorizedTester(false);
      }
  };

  const refreshStorageList = () => {
    setIsLoadingStorage(true);
    getAllMetadata().then(files => {
      setStoredFiles(files);
      setIsLoadingStorage(false);
    }).catch(console.error);
  };

  const filteredRootBus = useMemo(() => {
    if (!dataset) return null;
    if (!searchTerm.trim()) return dataset.rootBus;
    return filterBusTree(dataset.rootBus, searchTerm);
  }, [dataset, searchTerm]);

  const handleCursorChange = (t1: number | null, t2: number | null) => {
    setCursor1(t1);
    setCursor2(t2);
  };

  const resetCursors = () => {
    setCursor1(null);
    setCursor2(null);
  };

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (emailInputRef.current && emailInputRef.current.value.trim()) {
      setUserEmail(emailInputRef.current.value.trim());
    }
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setStatus(FileStatus.LOADING);
    const reader = new FileReader();

    reader.onload = async (e) => {
      try {
        const jsonContent = JSON.parse(e.target?.result as string);
        const name = file.name.replace('.json', '');
        const parsed = parseMatlabJson(jsonContent, name);
        
        // Save to storage immediately
        await saveDataset(parsed, name, userEmail || 'unknown');
        refreshStorageList();

        setDataset(parsed);
        setDatasetName(name);
        setStatus(FileStatus.PARSED);
        setErrorMsg(null);
        setChartSlots(Array(MAX_SLOTS).fill([]));
        setSearchTerm('');
        resetCursors();
      } catch (err) {
        setStatus(FileStatus.ERROR);
        setErrorMsg("Invalid JSON file. Please upload a valid JSON export from Matlab.");
        console.error(err);
      }
    };

    reader.readAsText(file);
    // Reset input
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleLoadStoredDataset = async (id: string, name: string) => {
    setStatus(FileStatus.LOADING);
    try {
      const parsed = await getDataset(id);
      if (parsed) {
        setDataset(parsed);
        setDatasetName(name);
        setStatus(FileStatus.PARSED);
        setErrorMsg(null);
        setChartSlots(Array(MAX_SLOTS).fill([]));
        setSearchTerm('');
        resetCursors();
      } else {
        setErrorMsg("Failed to load dataset from storage.");
        setStatus(FileStatus.ERROR);
      }
    } catch (err) {
      console.error(err);
      setErrorMsg("Error loading dataset.");
      setStatus(FileStatus.ERROR);
    }
  };

  const handleDeleteDataset = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm("Are you sure you want to delete this dataset?")) {
      await deleteDataset(id);
      refreshStorageList();
      if (datasetName === storedFiles.find(f => f.id === id)?.name) {
        setDataset(null);
        setStatus(FileStatus.IDLE);
      }
    }
  };

  const handleLogout = () => {
    setUserRole(null);
    setUserEmail(null);
    setDataset(null);
    setStatus(FileStatus.IDLE);
    setChartSlots(Array(MAX_SLOTS).fill([]));
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    setDragOverIndex(index);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOverIndex(null);
  };

  const handleDrop = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    setDragOverIndex(null);
    const signalId = e.dataTransfer.getData('signalId');
    
    if (signalId && dataset?.flatSignals[signalId]) {
      const signalToAdd = dataset.flatSignals[signalId];
      const currentSlotSignals = chartSlots[index];

      // Prevent duplicate signals in the same slot
      if (!currentSlotSignals.find(s => s.id === signalToAdd.id)) {
        const newSlots = [...chartSlots];
        newSlots[index] = [...currentSlotSignals, signalToAdd];
        setChartSlots(newSlots);
      }
    }
  };

  const removeSignal = (slotIndex: number, signalId: string) => {
    const newSlots = [...chartSlots];
    newSlots[slotIndex] = newSlots[slotIndex].filter(s => s.id !== signalId);
    setChartSlots(newSlots);
  };

  const clearSlot = (slotIndex: number) => {
    const newSlots = [...chartSlots];
    newSlots[slotIndex] = [];
    setChartSlots(newSlots);
  };

  const handleSelectSignal = (signal: SignalData) => {
    const emptyIndex = chartSlots.findIndex(s => s.length === 0);
    const newSlots = [...chartSlots];
    
    if (emptyIndex !== -1) {
       newSlots[emptyIndex] = [signal];
    } else {
       const targetIndex = 0;
       if (!newSlots[targetIndex].find(s => s.id === signal.id)) {
         newSlots[targetIndex] = [...newSlots[targetIndex], signal];
       }
    }
    setChartSlots(newSlots);
  };

  const getRoleColor = (role: UserRole) => {
      switch(role) {
          case 'admin': return 'bg-purple-600';
          case 'tester': return 'bg-blue-600';
          case 'viewer': return 'bg-emerald-600';
          default: return 'bg-slate-600';
      }
  };

  const getRoleTextColor = (role: UserRole) => {
    switch(role) {
        case 'admin': return 'text-purple-600';
        case 'tester': return 'text-blue-600';
        case 'viewer': return 'text-emerald-600';
        default: return 'text-slate-600';
    }
  };

  const getRoleBgColor = (role: UserRole) => {
    switch(role) {
        case 'admin': return 'bg-purple-50';
        case 'tester': return 'bg-blue-50';
        case 'viewer': return 'bg-emerald-50';
        default: return 'bg-slate-50';
    }
  };

  // --- Login Screen ---
  if (!userEmail) {
    return (
        <div className="h-screen w-full bg-slate-100 flex items-center justify-center p-4">
            <div className="max-w-md w-full bg-white rounded-xl shadow-lg overflow-hidden">
                <div className="p-8 text-center border-b bg-slate-50">
                    <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-blue-200 shadow-xl">
                        <Activity size={32} className="text-white" />
                    </div>
                    <h1 className="text-2xl font-bold text-slate-800">Data_Visualization</h1>
                    <p className="text-slate-500 mt-2">Sign in to your account</p>
                </div>
                <div className="p-8">
                    <form onSubmit={handleLogin} className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Email Address</label>
                            <input 
                                ref={emailInputRef}
                                type="email" 
                                required
                                placeholder="name@company.com"
                                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                            />
                        </div>
                        <button 
                            type="submit"
                            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 rounded-lg transition-colors flex items-center justify-center gap-2"
                        >
                            Continue
                            <ArrowRight size={16} />
                        </button>
                    </form>
                    <div className="mt-6 text-center text-xs text-slate-400">
                        <p>Simulink Data Visualization Platform</p>
                        <p>Airbus Internal Tool</p>
                    </div>
                </div>
            </div>
        </div>
    );
  }

  // --- Role Selection View ---
  if (!userRole) {
    const isAdmin = userEmail.toLowerCase() === ADMIN_EMAIL.toLowerCase();

    return (
      <div className="h-screen w-full bg-slate-100 flex items-center justify-center p-4">
        <div className="max-w-lg w-full bg-white rounded-xl shadow-lg overflow-hidden">
          <div className="p-6 border-b bg-slate-50 flex items-center justify-between">
             <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center">
                    <Activity size={20} className="text-white" />
                </div>
                <div>
                    <h1 className="text-lg font-bold text-slate-800">Select Role</h1>
                    <p className="text-xs text-slate-500">{userEmail}</p>
                </div>
             </div>
             <button onClick={() => setUserEmail(null)} className="text-xs text-slate-400 hover:text-red-500 underline">Switch Account</button>
          </div>
          
          <div className="p-6 space-y-3">
            {isAdmin && (
                <button 
                onClick={() => setUserRole('admin')}
                className="w-full flex items-center justify-between p-4 border border-purple-200 bg-purple-50/50 rounded-lg hover:border-purple-500 hover:bg-purple-50 transition-all group relative overflow-hidden"
                >
                <div className="absolute top-0 right-0 p-1 bg-purple-500 text-white text-[10px] rounded-bl-lg font-bold uppercase">
                    Restricted
                </div>
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-purple-100 text-purple-600 rounded-md group-hover:bg-purple-600 group-hover:text-white transition-colors">
                    <Shield size={20} />
                    </div>
                    <div className="text-left">
                    <div className="font-semibold text-slate-800">Administrator</div>
                    <div className="text-xs text-slate-500">Full System Access</div>
                    </div>
                </div>
                <ArrowRight size={18} className="text-purple-300 group-hover:text-purple-600" />
                </button>
            )}

            <button 
              onClick={() => isAuthorizedTester ? setUserRole('tester') : null}
              disabled={!isAuthorizedTester}
              className={clsx(
                  "w-full flex items-center justify-between p-4 border rounded-lg transition-all group relative",
                  isAuthorizedTester 
                    ? "border-slate-200 hover:border-blue-500 hover:bg-blue-50 cursor-pointer" 
                    : "border-slate-100 bg-slate-50 opacity-60 cursor-not-allowed"
              )}
            >
               {!isAuthorizedTester && (
                 <div className="absolute right-4 top-4 text-slate-400">
                    <Lock size={18} />
                 </div>
               )}
              <div className="flex items-center gap-3">
                <div className={clsx(
                    "p-2 rounded-md transition-colors",
                    isAuthorizedTester ? "bg-blue-100 text-blue-600 group-hover:bg-blue-600 group-hover:text-white" : "bg-slate-200 text-slate-400"
                )}>
                  <Upload size={20} />
                </div>
                <div className="text-left">
                  <div className="font-semibold text-slate-800">Tester</div>
                  <div className="text-xs text-slate-500">
                    {isAuthorizedTester ? "Upload & Analyze Data" : "Contact Admin for Access"}
                  </div>
                </div>
              </div>
              {isAuthorizedTester && <ArrowRight size={18} className="text-slate-300 group-hover:text-blue-500" />}
            </button>

            <button 
              onClick={() => setUserRole('viewer')}
              className="w-full flex items-center justify-between p-4 border border-slate-200 rounded-lg hover:border-emerald-500 hover:bg-emerald-50 transition-all group"
            >
              <div className="flex items-center gap-3">
                 <div className="p-2 bg-emerald-100 text-emerald-600 rounded-md group-hover:bg-emerald-600 group-hover:text-white transition-colors">
                  <Database size={20} />
                </div>
                <div className="text-left">
                  <div className="font-semibold text-slate-800">Viewer</div>
                  <div className="text-xs text-slate-500">Read-Only Access</div>
                </div>
              </div>
              <ArrowRight size={18} className="text-slate-300 group-hover:text-emerald-500" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  // --- Main App View ---
  const canUpload = userRole === 'tester' || userRole === 'admin';
  const canDelete = userRole === 'tester' || userRole === 'admin';

  return (
    <div className="flex h-screen w-full bg-slate-100 font-sans text-slate-900">
      <UserManagementModal 
        isOpen={showUserModal} 
        onClose={() => setShowUserModal(false)} 
        adminEmail={ADMIN_EMAIL}
      />
      
      {/* Sidebar */}
      <div className="w-80 flex flex-col bg-white border-r shadow-sm z-10 shrink-0 h-full">
        {/* Sidebar Header */}
        <div className="p-4 border-b bg-slate-50">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className={clsx("p-1.5 rounded text-white", getRoleColor(userRole))}>
                {userRole === 'admin' ? <Shield size={18} /> : <Activity size={18} />}
              </div>
              <div>
                <h1 className="text-lg font-bold text-slate-800 tracking-tight leading-none">Data_Visualization</h1>
                <span className={clsx("text-[10px] font-medium uppercase tracking-wider", getRoleTextColor(userRole))}>
                  {userRole} Workspace
                </span>
              </div>
            </div>
            <button 
              onClick={handleLogout}
              className="text-slate-400 hover:text-slate-600 p-1 rounded-md hover:bg-slate-200 transition-colors"
              title="Logout"
            >
              <LogOut size={16} />
            </button>
          </div>

          <div className="text-xs text-slate-400 mb-2 truncate px-1">
             User: {userEmail}
          </div>

          {/* Controls */}
          <div className="space-y-2">
            {userRole === 'admin' && (
                <button 
                  onClick={() => setShowUserModal(true)}
                  className="w-full flex items-center justify-center gap-2 bg-purple-100 text-purple-700 hover:bg-purple-200 py-2 px-4 rounded-md text-sm font-medium transition-all shadow-sm mb-2"
                >
                  <Users size={16} />
                  Manage Testers
                </button>
            )}

            {canUpload && (
              <div className="relative">
                <input 
                  type="file" 
                  ref={fileInputRef}
                  accept=".json"
                  onChange={handleFileUpload}
                  className="hidden" 
                />
                <button 
                  onClick={() => fileInputRef.current?.click()}
                  className={clsx(
                      "w-full flex items-center justify-center gap-2 text-white py-2 px-4 rounded-md text-sm font-medium transition-all shadow-sm",
                      userRole === 'admin' ? "bg-purple-600 hover:bg-purple-700" : "bg-blue-600 hover:bg-blue-700"
                  )}
                >
                  <Upload size={16} />
                  Upload New Dataset
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Database List (Visible to Both) */}
        <div className="p-4 border-b bg-slate-50/50">
          <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
            <Database size={12} />
            Repository
          </h3>
          <div className="max-h-40 overflow-y-auto space-y-1 pr-1 custom-scrollbar">
            {isLoadingStorage && <div className="text-center text-xs text-slate-400">Loading...</div>}
            {!isLoadingStorage && storedFiles.length === 0 && (
              <div className="text-center text-xs text-slate-400 italic py-2">No datasets found</div>
            )}
            {storedFiles.map(file => (
              <div 
                key={file.id}
                onClick={() => handleLoadStoredDataset(file.id, file.name)}
                className={clsx(
                  "group flex items-center justify-between p-2 rounded-md cursor-pointer border text-sm transition-all",
                  datasetName === file.name 
                    ? `bg-opacity-50 border-opacity-50 ${getRoleBgColor(userRole)} border-${getRoleTextColor(userRole).split('-')[1]}-200 text-${getRoleTextColor(userRole).split('-')[1]}-700`
                    : "bg-white border-slate-200 text-slate-600 hover:border-slate-400"
                )}
              >
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{file.name}</div>
                  <div className="text-[10px] text-slate-400 flex items-center gap-1">
                    {new Date(file.uploadDate).toLocaleDateString()} 
                    <span>•</span>
                    <User size={8} /> {file.uploader === userEmail ? 'You' : file.uploader.split('@')[0]}
                  </div>
                </div>
                {canDelete && (
                  <button 
                    onClick={(e) => handleDeleteDataset(file.id, e)}
                    className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded opacity-0 group-hover:opacity-100 transition-all"
                    title="Delete Dataset"
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
        
        {/* Search Bar */}
        {status === FileStatus.PARSED && (
           <div className="px-4 pt-4 pb-2">
             <div className="relative">
               <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
               <input
                 type="text"
                 placeholder="Filter signals..."
                 value={searchTerm}
                 onChange={(e) => setSearchTerm(e.target.value)}
                 className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder-slate-400"
               />
             </div>
             <p className="text-[10px] text-slate-400 mt-2 text-center">
               Drag signals to the right to visualize
             </p>
           </div>
        )}

        <div className="flex-1 overflow-y-auto p-2">
          {status === FileStatus.IDLE && (
            <div className="text-center p-6 text-slate-400 text-sm mt-10">
              <FileJson size={40} className="mx-auto mb-2 opacity-20" />
              <p>Select a dataset from the Repository to start.</p>
              {canUpload && <p className="text-xs mt-2 opacity-75">Or upload a new JSON file.</p>}
            </div>
          )}

          {status === FileStatus.LOADING && (
            <div className="flex flex-col items-center justify-center h-40 space-y-3">
              <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
              <span className="text-sm text-slate-500">Loading dataset...</span>
            </div>
          )}

          {status === FileStatus.ERROR && (
            <div className="p-4 bg-red-50 text-red-600 rounded-md text-sm flex items-start gap-2">
              <AlertCircle size={16} className="mt-0.5 shrink-0" />
              <p>{errorMsg}</p>
            </div>
          )}

          {status === FileStatus.PARSED && dataset && (
            <div className="space-y-1">
              <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider px-2 mb-2 mt-2">
                {datasetName} Structure
              </h3>
              {filteredRootBus ? (
                <SignalTree 
                  node={filteredRootBus} 
                  onSelectSignal={handleSelectSignal}
                  autoExpand={!!searchTerm.trim()}
                />
              ) : (
                <div className="p-4 text-center text-sm text-slate-500">
                   No results found for "{searchTerm}"
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Main Content (Slots) */}
      <main className="flex-1 overflow-y-auto p-6 bg-slate-100">
        <div className="max-w-5xl mx-auto space-y-6">
          {status === FileStatus.PARSED ? (
            <>
              {chartSlots.map((signals, index) => (
                <div 
                  key={index}
                  onDragOver={(e) => handleDragOver(e, index)}
                  onDragLeave={handleDragLeave}
                  onDrop={(e) => handleDrop(e, index)}
                  className={clsx(
                    "transition-all duration-200 rounded-lg",
                    signals.length === 0 && "h-32 border-2 border-dashed flex items-center justify-center",
                    signals.length === 0 && dragOverIndex === index ? `border-${getRoleTextColor(userRole).split('-')[1]}-500 bg-blue-50` : "border-slate-300 bg-slate-50/50",
                    signals.length === 0 && dragOverIndex !== index && "hover:border-slate-400 hover:bg-slate-100",
                    signals.length > 0 && dragOverIndex === index && "ring-2 ring-blue-500 ring-offset-2"
                  )}
                >
                  {signals.length > 0 ? (
                    <ChartViewer 
                      signals={signals} 
                      onRemoveSignal={(id) => removeSignal(index, id)}
                      onClear={() => clearSlot(index)}
                      cursor1={cursor1}
                      cursor2={cursor2}
                      onCursorChange={handleCursorChange}
                    />
                  ) : (
                    <div className="text-center pointer-events-none">
                       {dragOverIndex === index ? (
                          <span className={clsx("font-medium", getRoleTextColor(userRole))}>Drop to add signal</span>
                       ) : (
                        <div className="flex flex-col items-center text-slate-400">
                           <Plus size={24} className="mb-2 opacity-50" />
                           <span className="text-sm font-medium">Slot {index + 1}</span>
                           <span className="text-xs opacity-75">Drag signals here</span>
                        </div>
                       )}
                    </div>
                  )}
                </div>
              ))}
            </>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-slate-400 min-h-[500px]">
               <Activity size={64} className="mb-4 opacity-10" />
               <p>Select or upload a dataset to visualize signals.</p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default App;