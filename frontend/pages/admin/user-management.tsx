// pages/admin/user-management.tsx

import { useEffect, useState } from 'react';
import { useAuth } from '../../components/AuthProvider';
import { useRouter } from 'next/router';
import AdminLayout from '../../components/AdminLayout';
import { myFetch } from '../../utils/myFetch';  // <-- Ajusta si usas fetch normal o un helper

interface User {
  id: number;
  name: string;
  email: string;
  role: string;
}

interface UpdateUserPayload {
  name: string;
  email: string;
  role: string;
  newPassword?: string;
}

export default function UserManagementPage() {
  const { token, role } = useAuth();
  const router = useRouter();

  // Lista de usuarios
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Form para crear usuario
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [newUserRole, setNewUserRole] = useState('user'); // user | admin

  // ===== Estados para edición inline =====
  const [editingUserId, setEditingUserId] = useState<number | null>(null);

  // Campos temporales para la edición (inline)
  const [tempName, setTempName] = useState('');
  const [tempEmail, setTempEmail] = useState('');
  const [tempRole, setTempRole] = useState('');
  const [tempPass, setTempPass] = useState('');

  // =========================================================
  // 1) Chequeo de token y carga de usuarios
  // =========================================================
  useEffect(() => {
    if (!token) {
      router.push('/');
      return;
    }
    fetchUsers();
  }, [token, router]);

  async function fetchUsers() {
    setLoading(true);
    setError('');

    const res = await myFetch('/admin/user-management', {
      method: 'GET',
    });

    setLoading(false);

    if (res.status === 'error') {
      setError(res.message || 'Failed to fetch users');
      return;
    }

    setUsers(res.data.users || []);
  }

  // =========================================================
  // 2) Crear usuario
  // =========================================================
  async function handleCreateUser() {
    if (!name.trim() || !email.trim() || !password.trim()) {
      alert('All fields (name, email, password) are required.');
      return;
    }
    setLoading(true);
    setError('');

    const res = await myFetch('/admin/user-management', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, password, role: newUserRole }),
    });

    setLoading(false);

    if (res.status === 'error') {
      setError(res.message || 'Error creating user');
      return;
    }

    // Limpia y recarga
    setName('');
    setEmail('');
    setPassword('');
    setNewUserRole('user');
    alert('User created successfully!');
    fetchUsers();
  }

  // =========================================================
  // 3) Editar inline
  // =========================================================
  function startEditInline(u: User) {
    setEditingUserId(u.id);
    setTempName(u.name);
    setTempEmail(u.email);
    setTempRole(u.role);
    setTempPass('');
  }

  function cancelEditInline() {
    setEditingUserId(null);
  }

  // Guardar edición inline => PUT /admin/user-management/:id
  async function saveEditInline(userId: number) {
    setLoading(true);
    setError('');

    const payload: UpdateUserPayload = {
      name: tempName,
      email: tempEmail,
      role: tempRole,
    };
    // Si tempPass no está vacío => newPassword
    if (tempPass.trim()) {
      payload.newPassword = tempPass.trim();
    }

    const res = await myFetch(`/admin/user-management/${userId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    setLoading(false);

    if (res.status === 'error') {
      setError(res.message || 'Error updating user');
      return;
    }
    alert('User updated successfully!');
    setEditingUserId(null);
    fetchUsers();
  }

  // =========================================================
  // 4) Eliminar usuario => DELETE /admin/user-management/:id
  // =========================================================
  async function handleRemoveUser(userId: number) {
    if (!confirm('Are you sure you want to remove this user?')) return;

    setLoading(true);
    setError('');

    const res = await myFetch(`/admin/user-management/${userId}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
    });

    setLoading(false);

    if (res.status === 'error') {
      setError(res.message || 'Error removing user');
      return;
    }

    alert('User removed successfully!');
    fetchUsers();
  }

  // 5) Si no es admin => no ver la página
  if (role !== 'admin') {
    return (
      <AdminLayout userRole={role} activeMenu="User Management">
        <div className="p-4">
          <h1 className="text-2xl font-bold mb-4">User Management</h1>
          <p className="text-red-600">You are not authorized to view this page.</p>
        </div>
      </AdminLayout>
    );
  }

  // 6) Render principal
  return (
    <AdminLayout userRole={role} activeMenu="User Management">
      <div className="p-8 space-y-6">
        <h1 className="text-2xl font-bold">User Management</h1>

        {error && <p className="text-red-600">{error}</p>}

        {/* Form de creación */}
        <div className="space-y-2 max-w-sm">
          <h2 className="text-lg font-semibold">Create a new user</h2>

          <div>
            <label className="block font-medium mb-1">Name</label>
            <input
              type="text"
              className="border p-2 rounded w-full"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div>
            <label className="block font-medium mb-1">Email</label>
            <input
              type="email"
              className="border p-2 rounded w-full"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div>
            <label className="block font-medium mb-1">Password</label>
            <input
              type="password"
              className="border p-2 rounded w-full"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          <div>
            <label className="block font-medium mb-1">Role</label>
            <select
              className="border p-2 rounded w-full"
              value={newUserRole}
              onChange={(e) => setNewUserRole(e.target.value)}
            >
              <option value="user">User</option>
              <option value="admin">Admin</option>
            </select>
          </div>

          <div>
            <button
              onClick={handleCreateUser}
              className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
              disabled={loading}
            >
              {loading ? 'Creating...' : 'Create User'}
            </button>
          </div>
        </div>

        {/* Tabla de usuarios */}
        <div>
          <h2 className="text-lg font-semibold mb-2">All Users</h2>
          {loading && <p>Loading...</p>}
          {!loading && users.length === 0 && <p>No users found.</p>}

          {users.length > 0 && (
            <div className="max-w-xl overflow-x-auto border rounded bg-white">
              <table className="w-full text-sm">
                <thead className="bg-gray-100 border-b">
                  <tr>
                    <th className="py-2 px-4 text-left">Name</th>
                    <th className="py-2 px-4 text-left">Email</th>
                    <th className="py-2 px-4 text-center">Password</th>
                    <th className="py-2 px-4 text-center">Role</th>
                    <th className="py-2 px-4 text-center">Edit</th>
                    <th className="py-2 px-2 w-12 text-center">Delete</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => {
                    const isEditing = (editingUserId === u.id);

                    return (
                      <tr key={u.id} className="border-b hover:bg-gray-50">
                        {/* NAME */}
                        <td className="py-2 px-4">
                          {isEditing ? (
                            <input
                              type="text"
                              value={tempName}
                              onChange={(e) => setTempName(e.target.value)}
                              className="border p-1 rounded w-full"
                            />
                          ) : (
                            u.name
                          )}
                        </td>

                        {/* EMAIL */}
                        <td className="py-2 px-4">
                          {isEditing ? (
                            <input
                              type="email"
                              value={tempEmail}
                              onChange={(e) => setTempEmail(e.target.value)}
                              className="border p-1 rounded w-full"
                            />
                          ) : (
                            u.email
                          )}
                        </td>

                        {/* PASSWORD => Solo dots + un input si isEditing */}
                        <td className="py-2 px-4 text-center">
                          {isEditing ? (
                            <input
                              type="password"
                              value={tempPass}
                              onChange={(e) => setTempPass(e.target.value)}
                              className="border p-1 rounded"
                              style={{ width: '6rem' }}
                              placeholder="(new pass)"
                            />
                          ) : (
                            '••••••'
                          )}
                        </td>

                        {/* ROLE */}
                        <td className="py-2 px-4 text-center">
                          {isEditing ? (
                            <select
                              value={tempRole}
                              onChange={(e) => setTempRole(e.target.value)}
                              className="border p-1 rounded"
                            >
                              <option value="user">User</option>
                              <option value="admin">Admin</option>
                            </select>
                          ) : (
                            u.role
                          )}
                        </td>

                        {/* EDIT => SIEMPRE visible, incluso si u.id === 1 */}
                        <td className="py-2 px-4 text-center">
                          {!isEditing ? (
                            // Botón para iniciar edición
                            <button
                              onClick={() => startEditInline(u)}
                              className="text-blue-600 hover:text-blue-800"
                              title="Edit user"
                            >
                              <i className="fa-solid fa-pen-to-square"></i>
                            </button>
                          ) : (
                            // Modo edición => mostrar guardado/cancelar
                            <div className="flex items-center justify-center space-x-3">
                              <button
                                onClick={() => saveEditInline(u.id)}
                                className="text-green-600 hover:text-green-800"
                                title="Save changes"
                              >
                                <i className="fa-solid fa-check"></i>
                              </button>
                              <button
                                onClick={() => cancelEditInline()}
                                className="text-gray-500 hover:text-gray-700"
                                title="Cancel edit"
                              >
                                <i className="fa-solid fa-xmark"></i>
                              </button>
                            </div>
                          )}
                        </td>

                        {/* DELETE => OCULTAMOS para userId=1 */}
                        <td className="py-2 px-2 w-12 text-center align-middle">
                          {u.id === 1 ? (
                            // Si es id=1 => no mostramos el botón
                            null
                          ) : (
                            <button
                              onClick={() => handleRemoveUser(u.id)}
                              className="text-red-600 hover:text-red-800 p-0"
                              style={{ lineHeight: '1' }}
                              title="Delete User"
                            >
                              <i className="fa-solid fa-xmark"></i>
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}

