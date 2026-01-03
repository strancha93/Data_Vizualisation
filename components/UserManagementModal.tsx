import React, { useState, useEffect } from 'react';
import { X, UserPlus, Trash2, ShieldCheck, User } from 'lucide-react';
import { addAuthorizedUser, removeAuthorizedUser, getAuthorizedUsers } from '../utils/storage';
import { AuthorizedUser } from '../types';

interface UserManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
  adminEmail: string;
}

const UserManagementModal: React.FC<UserManagementModalProps> = ({ isOpen, onClose, adminEmail }) => {
  const [users, setUsers] = useState<AuthorizedUser[]>([]);
  const [newEmail, setNewEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      loadUsers();
    }
  }, [isOpen]);

  const loadUsers = async () => {
    try {
      setLoading(true);
      const list = await getAuthorizedUsers();
      setUsers(list);
    } catch (err) {
      console.error(err);
      setError("Failed to load users");
    } finally {
      setLoading(false);
    }
  };

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEmail.trim()) return;
    
    if (users.find(u => u.email.toLowerCase() === newEmail.trim().toLowerCase())) {
        setError("User already exists");
        return;
    }

    try {
      setLoading(true);
      await addAuthorizedUser(newEmail, adminEmail);
      setNewEmail('');
      setError(null);
      await loadUsers();
    } catch (err) {
      console.error(err);
      setError("Failed to add user");
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveUser = async (email: string) => {
    if (!confirm(`Are you sure you want to remove access for ${email}?`)) return;
    try {
      setLoading(true);
      await removeAuthorizedUser(email);
      await loadUsers();
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b bg-slate-50">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-purple-100 rounded-md text-purple-700">
                <ShieldCheck size={20} />
            </div>
            <div>
                <h2 className="text-lg font-bold text-slate-800">Manage Testers</h2>
                <p className="text-xs text-slate-500">Grant upload permissions</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-4 space-y-4">
           
           {/* Add Form */}
           <form onSubmit={handleAddUser} className="flex flex-col gap-2">
              <label className="text-xs font-semibold text-slate-600 uppercase">Add Google Account</label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                    <User size={16} className="absolute left-3 top-2.5 text-slate-400" />
                    <input 
                        type="email" 
                        value={newEmail}
                        onChange={(e) => setNewEmail(e.target.value)}
                        placeholder="email@example.com"
                        required
                        className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-md text-sm focus:ring-2 focus:ring-purple-500 focus:border-purple-500 outline-none"
                    />
                </div>
                <button 
                    type="submit" 
                    disabled={loading}
                    className="bg-purple-600 hover:bg-purple-700 text-white px-3 py-2 rounded-md transition-colors flex items-center gap-1 disabled:opacity-50"
                >
                    <UserPlus size={18} />
                </button>
              </div>
              {error && <p className="text-xs text-red-500">{error}</p>}
           </form>

           {/* List */}
           <div className="mt-4">
              <label className="text-xs font-semibold text-slate-600 uppercase mb-2 block">Authorized Users ({users.length})</label>
              <div className="border border-slate-200 rounded-md divide-y divide-slate-100 max-h-60 overflow-y-auto">
                {users.length === 0 ? (
                    <div className="p-4 text-center text-slate-400 text-sm italic">No authorized testers yet.</div>
                ) : (
                    users.map(user => (
                        <div key={user.email} className="p-3 flex items-center justify-between hover:bg-slate-50">
                            <div>
                                <div className="text-sm font-medium text-slate-800">{user.email}</div>
                                <div className="text-[10px] text-slate-400">Added: {new Date(user.addedDate).toLocaleDateString()}</div>
                            </div>
                            <button 
                                onClick={() => handleRemoveUser(user.email)}
                                className="text-slate-300 hover:text-red-500 p-1.5 rounded hover:bg-red-50 transition-colors"
                            >
                                <Trash2 size={14} />
                            </button>
                        </div>
                    ))
                )}
              </div>
           </div>
        </div>
      </div>
    </div>
  );
};

export default UserManagementModal;