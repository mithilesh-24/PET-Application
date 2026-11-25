using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Security.AccessControl;
using System.Security.Principal;
using System.Text;
using System.Threading.Tasks;

namespace PetPrep.Sandbox
{
    internal static class Native
    {
        public const uint SEM_FAILCRITICALERRORS = 0x0001;
        public const uint SEM_NOGPFAULTERRORBOX = 0x0002;
        public const uint SEM_NOOPENFILEERRORBOX = 0x8000;

        public const uint EXTENDED_STARTUPINFO_PRESENT = 0x00080000;
        public const uint CREATE_NO_WINDOW = 0x08000000;
        public const uint CREATE_SUSPENDED = 0x00000004;
        public const uint CREATE_UNICODE_ENVIRONMENT = 0x00000400;

        public const int STARTF_USESTDHANDLES = 0x00000100;
        public const uint HANDLE_FLAG_INHERIT = 0x00000001;

        public static readonly IntPtr PROC_THREAD_ATTRIBUTE_HANDLE_LIST = (IntPtr)0x00020002;
        public static readonly IntPtr PROC_THREAD_ATTRIBUTE_SECURITY_CAPABILITIES = (IntPtr)0x00020009;

        public const int JobObjectBasicUIRestrictions = 4;
        public const int JobObjectExtendedLimitInformation = 9;

        public const uint JOB_OBJECT_LIMIT_JOB_TIME = 0x00000004;
        public const uint JOB_OBJECT_LIMIT_ACTIVE_PROCESS = 0x00000008;
        public const uint JOB_OBJECT_LIMIT_PROCESS_MEMORY = 0x00000100;
        public const uint JOB_OBJECT_LIMIT_JOB_MEMORY = 0x00000200;
        public const uint JOB_OBJECT_LIMIT_DIE_ON_UNHANDLED_EXCEPTION = 0x00000400;
        public const uint JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE = 0x00002000;

        public const uint JOB_OBJECT_UILIMIT_HANDLES = 0x00000001;
        public const uint JOB_OBJECT_UILIMIT_READCLIPBOARD = 0x00000002;
        public const uint JOB_OBJECT_UILIMIT_WRITECLIPBOARD = 0x00000004;
        public const uint JOB_OBJECT_UILIMIT_SYSTEMPARAMETERS = 0x00000008;
        public const uint JOB_OBJECT_UILIMIT_DISPLAYSETTINGS = 0x00000010;
        public const uint JOB_OBJECT_UILIMIT_GLOBALATOMS = 0x00000020;
        public const uint JOB_OBJECT_UILIMIT_DESKTOP = 0x00000040;
        public const uint JOB_OBJECT_UILIMIT_EXITWINDOWS = 0x00000080;

        public const uint TOKEN_ALL_ACCESS = 0x000F01FF;
        public const uint DISABLE_MAX_PRIVILEGE = 0x1;
        public const uint LUA_TOKEN = 0x4;
        public const uint WRITE_RESTRICTED = 0x8;
        public const uint SE_GROUP_INTEGRITY = 0x00000020;
        public const int TokenIntegrityLevel = 25;
        public const int SE_FILE_OBJECT = 1;
        public const uint LABEL_SECURITY_INFORMATION = 0x00000010;
        public const uint ACL_REVISION = 2;
        public const uint OBJECT_INHERIT_ACE = 0x1;
        public const uint CONTAINER_INHERIT_ACE = 0x2;
        public const uint SYSTEM_MANDATORY_LABEL_NO_WRITE_UP = 0x1;

        [StructLayout(LayoutKind.Sequential)]
        public struct SECURITY_ATTRIBUTES
        {
            public int nLength;
            public IntPtr lpSecurityDescriptor;
            [MarshalAs(UnmanagedType.Bool)]
            public bool bInheritHandle;
        }

        [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
        public struct STARTUPINFO
        {
            public int cb;
            public string lpReserved;
            public string lpDesktop;
            public string lpTitle;
            public int dwX;
            public int dwY;
            public int dwXSize;
            public int dwYSize;
            public int dwXCountChars;
            public int dwYCountChars;
            public int dwFillAttribute;
            public int dwFlags;
            public short wShowWindow;
            public short cbReserved2;
            public IntPtr lpReserved2;
            public IntPtr hStdInput;
            public IntPtr hStdOutput;
            public IntPtr hStdError;
        }

        [StructLayout(LayoutKind.Sequential)]
        public struct STARTUPINFOEX
        {
            public STARTUPINFO StartupInfo;
            public IntPtr lpAttributeList;
        }

        [StructLayout(LayoutKind.Sequential)]
        public struct PROCESS_INFORMATION
        {
            public IntPtr hProcess;
            public IntPtr hThread;
            public int dwProcessId;
            public int dwThreadId;
        }

        [StructLayout(LayoutKind.Sequential)]
        public struct SECURITY_CAPABILITIES
        {
            public IntPtr AppContainerSid;
            public IntPtr Capabilities;
            public uint CapabilityCount;
            public uint Reserved;
        }

        [StructLayout(LayoutKind.Sequential)]
        public struct JOBOBJECT_BASIC_LIMIT_INFORMATION
        {
            public long PerProcessUserTimeLimit;
            public long PerJobUserTimeLimit;
            public uint LimitFlags;
            public UIntPtr MinimumWorkingSetSize;
            public UIntPtr MaximumWorkingSetSize;
            public uint ActiveProcessLimit;
            public UIntPtr Affinity;
            public uint PriorityClass;
            public uint SchedulingClass;
        }

        [StructLayout(LayoutKind.Sequential)]
        public struct IO_COUNTERS
        {
            public ulong ReadOperationCount;
            public ulong WriteOperationCount;
            public ulong OtherOperationCount;
            public ulong ReadTransferCount;
            public ulong WriteTransferCount;
            public ulong OtherTransferCount;
        }

        [StructLayout(LayoutKind.Sequential)]
        public struct JOBOBJECT_EXTENDED_LIMIT_INFORMATION
        {
            public JOBOBJECT_BASIC_LIMIT_INFORMATION BasicLimitInformation;
            public IO_COUNTERS IoInfo;
            public UIntPtr ProcessMemoryLimit;
            public UIntPtr JobMemoryLimit;
            public UIntPtr PeakProcessMemoryUsed;
            public UIntPtr PeakJobMemoryUsed;
        }

        [StructLayout(LayoutKind.Sequential)]
        public struct JOBOBJECT_BASIC_UI_RESTRICTIONS
        {
            public uint UIRestrictionsClass;
        }

        [StructLayout(LayoutKind.Sequential)]
        public struct SID_AND_ATTRIBUTES
        {
            public IntPtr Sid;
            public uint Attributes;
        }

        [StructLayout(LayoutKind.Sequential)]
        public struct TOKEN_MANDATORY_LABEL
        {
            public SID_AND_ATTRIBUTES Label;
        }

        [DllImport("user32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
        public static extern IntPtr CreateDesktopW(
            string lpszDesktop,
            string lpszDevice,
            IntPtr pDevmode,
            uint dwFlags,
            uint dwDesiredAccess,
            IntPtr lpsa);

        [DllImport("user32.dll", SetLastError = true)]
        [return: MarshalAs(UnmanagedType.Bool)]
        public static extern bool CloseDesktop(IntPtr hDesktop);

        public const uint GENERIC_ALL = 0x10000000;
        public const int SE_WINDOW_OBJECT = 4;

        [DllImport("kernel32.dll", SetLastError = true)]
        public static extern IntPtr GetCurrentProcess();

        [DllImport("kernel32.dll", SetLastError = true)]
        public static extern uint SetErrorMode(uint uMode);

        [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
        public static extern IntPtr CreateJobObject(IntPtr lpJobAttributes, string lpName);

        [DllImport("kernel32.dll", SetLastError = true)]
        [return: MarshalAs(UnmanagedType.Bool)]
        public static extern bool SetInformationJobObject(
            IntPtr hJob,
            int jobObjectInfoClass,
            IntPtr lpJobObjectInfo,
            uint cbJobObjectInfoLength);

        [DllImport("kernel32.dll", SetLastError = true)]
        [return: MarshalAs(UnmanagedType.Bool)]
        public static extern bool QueryInformationJobObject(
            IntPtr hJob,
            int jobObjectInfoClass,
            IntPtr lpJobObjectInfo,
            uint cbJobObjectInfoLength,
            out uint lpReturnLength);

        [DllImport("kernel32.dll", SetLastError = true)]
        [return: MarshalAs(UnmanagedType.Bool)]
        public static extern bool AssignProcessToJobObject(IntPtr hJob, IntPtr hProcess);

        [DllImport("kernel32.dll", SetLastError = true)]
        [return: MarshalAs(UnmanagedType.Bool)]
        public static extern bool TerminateJobObject(IntPtr hJob, uint uExitCode);

        [DllImport("kernel32.dll", SetLastError = true)]
        public static extern uint ResumeThread(IntPtr hThread);

        [DllImport("kernel32.dll", SetLastError = true)]
        [return: MarshalAs(UnmanagedType.Bool)]
        public static extern bool CloseHandle(IntPtr hObject);

        [DllImport("kernel32.dll", SetLastError = true)]
        [return: MarshalAs(UnmanagedType.Bool)]
        public static extern bool CreatePipe(
            out IntPtr hReadPipe,
            out IntPtr hWritePipe,
            ref SECURITY_ATTRIBUTES lpPipeAttributes,
            uint nSize);

        [DllImport("kernel32.dll", SetLastError = true)]
        [return: MarshalAs(UnmanagedType.Bool)]
        public static extern bool SetHandleInformation(IntPtr hObject, uint dwMask, uint dwFlags);

        [DllImport("kernel32.dll", SetLastError = true)]
        [return: MarshalAs(UnmanagedType.Bool)]
        public static extern bool InitializeProcThreadAttributeList(
            IntPtr lpAttributeList,
            int dwAttributeCount,
            int dwFlags,
            ref IntPtr lpSize);

        [DllImport("kernel32.dll", SetLastError = true)]
        [return: MarshalAs(UnmanagedType.Bool)]
        public static extern bool UpdateProcThreadAttribute(
            IntPtr lpAttributeList,
            uint dwFlags,
            IntPtr Attribute,
            IntPtr lpValue,
            IntPtr cbSize,
            IntPtr lpPreviousValue,
            IntPtr lpReturnSize);

        [DllImport("kernel32.dll", SetLastError = true)]
        public static extern void DeleteProcThreadAttributeList(IntPtr lpAttributeList);

        [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
        [return: MarshalAs(UnmanagedType.Bool)]
        public static extern bool CreateProcessW(
            string lpApplicationName,
            StringBuilder lpCommandLine,
            IntPtr lpProcessAttributes,
            IntPtr lpThreadAttributes,
            [MarshalAs(UnmanagedType.Bool)] bool bInheritHandles,
            uint dwCreationFlags,
            IntPtr lpEnvironment,
            string lpCurrentDirectory,
            ref STARTUPINFOEX lpStartupInfo,
            out PROCESS_INFORMATION lpProcessInformation);

        [DllImport("advapi32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
        [return: MarshalAs(UnmanagedType.Bool)]
        public static extern bool CreateProcessAsUserW(
            IntPtr hToken,
            string lpApplicationName,
            StringBuilder lpCommandLine,
            IntPtr lpProcessAttributes,
            IntPtr lpThreadAttributes,
            [MarshalAs(UnmanagedType.Bool)] bool bInheritHandles,
            uint dwCreationFlags,
            IntPtr lpEnvironment,
            string lpCurrentDirectory,
            ref STARTUPINFOEX lpStartupInfo,
            out PROCESS_INFORMATION lpProcessInformation);

        [DllImport("kernel32.dll", SetLastError = true)]
        public static extern uint WaitForSingleObject(IntPtr hHandle, uint dwMilliseconds);

        [DllImport("kernel32.dll", SetLastError = true)]
        [return: MarshalAs(UnmanagedType.Bool)]
        public static extern bool GetExitCodeProcess(IntPtr hProcess, out uint lpExitCode);

        [DllImport("userenv.dll", SetLastError = false, CharSet = CharSet.Unicode)]
        public static extern int CreateAppContainerProfile(
            string pszAppContainerName,
            string pszDisplayName,
            string pszDescription,
            IntPtr pCapabilities,
            uint dwCapabilityCount,
            out IntPtr ppSidAppContainerSid);

        [DllImport("userenv.dll", SetLastError = false, CharSet = CharSet.Unicode)]
        public static extern int DeriveAppContainerSidFromAppContainerName(
            string pszAppContainerName,
            out IntPtr ppsidAppContainerSid);

        [DllImport("userenv.dll", SetLastError = false, CharSet = CharSet.Unicode)]
        public static extern int DeleteAppContainerProfile(string pszAppContainerName);

        [DllImport("advapi32.dll", SetLastError = true)]
        public static extern IntPtr FreeSid(IntPtr pSid);

        [DllImport("advapi32.dll", SetLastError = true)]
        [return: MarshalAs(UnmanagedType.Bool)]
        public static extern bool ConvertSidToStringSidW(IntPtr Sid, out IntPtr StringSid);

        [DllImport("advapi32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
        [return: MarshalAs(UnmanagedType.Bool)]
        public static extern bool ConvertStringSidToSidW(string StringSid, out IntPtr Sid);

        [DllImport("kernel32.dll", SetLastError = true)]
        public static extern IntPtr LocalFree(IntPtr hMem);

        [DllImport("advapi32.dll", SetLastError = true)]
        [return: MarshalAs(UnmanagedType.Bool)]
        public static extern bool OpenProcessToken(IntPtr ProcessHandle, uint DesiredAccess, out IntPtr TokenHandle);

        [DllImport("advapi32.dll", SetLastError = true)]
        [return: MarshalAs(UnmanagedType.Bool)]
        public static extern bool CreateRestrictedToken(
            IntPtr ExistingTokenHandle,
            uint Flags,
            uint DisableSidCount,
            IntPtr SidsToDisable,
            uint DeletePrivilegeCount,
            IntPtr PrivilegesToDelete,
            uint RestrictedSidCount,
            IntPtr SidsToRestrict,
            out IntPtr NewTokenHandle);

        [DllImport("advapi32.dll", SetLastError = true)]
        [return: MarshalAs(UnmanagedType.Bool)]
        public static extern bool SetTokenInformation(
            IntPtr TokenHandle,
            int TokenInformationClass,
            IntPtr TokenInformation,
            uint TokenInformationLength);

        [DllImport("advapi32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
        public static extern uint SetNamedSecurityInfoW(
            string pObjectName,
            int ObjectType,
            uint SecurityInfo,
            IntPtr psidOwner,
            IntPtr psidGroup,
            IntPtr pDacl,
            IntPtr pSacl);

        [DllImport("advapi32.dll", SetLastError = true)]
        [return: MarshalAs(UnmanagedType.Bool)]
        public static extern bool InitializeAcl(IntPtr pAcl, uint nAclLength, uint dwAclRevision);

        [DllImport("advapi32.dll", SetLastError = true)]
        [return: MarshalAs(UnmanagedType.Bool)]
        public static extern bool AddMandatoryAce(
            IntPtr pAcl,
            uint dwAceRevision,
            uint AceFlags,
            uint MandatoryPolicy,
            IntPtr pLabelSid);
    }

    internal sealed class Options
    {
        public string Mode = "appcontainer";
        public string WorkDir = ".";
        public bool WritableWorkDir = false;
        public int TimeoutMs = 5000;
        public int MemoryMb = 256;
        public int MaxProcs = 64;
        public int MaxOutputBytes = 1024 * 1024;
        public readonly List<string> ReadOnlyDirs = new List<string>();
        public readonly List<string> Cmd = new List<string>();
    }

    internal static class Program
    {
        private static string QuoteArg(string arg)
        {
            if (string.IsNullOrEmpty(arg)) return "\"\"";
            if (arg.IndexOfAny(new[] { ' ', '\t', '\n', '\v', '"' }) < 0) return arg;
            var sb = new StringBuilder("\"");
            int bs = 0;
            foreach (char c in arg)
            {
                if (c == '\\')
                {
                    bs++;
                }
                else if (c == '"')
                {
                    sb.Append('\\', bs * 2 + 1);
                    sb.Append('"');
                    bs = 0;
                }
                else
                {
                    if (bs > 0) sb.Append('\\', bs);
                    sb.Append(c);
                    bs = 0;
                }
            }
            if (bs > 0) sb.Append('\\', bs * 2);
            sb.Append('"');
            return sb.ToString();
        }

        private static string JsonEscape(string s)
        {
            if (s == null) return "null";
            var sb = new StringBuilder("\"");
            foreach (char c in s)
            {
                switch (c)
                {
                    case '"': sb.Append("\\\""); break;
                    case '\\': sb.Append("\\\\"); break;
                    case '\b': sb.Append("\\b"); break;
                    case '\f': sb.Append("\\f"); break;
                    case '\n': sb.Append("\\n"); break;
                    case '\r': sb.Append("\\r"); break;
                    case '\t': sb.Append("\\t"); break;
                    default:
                        if (c < 32) sb.AppendFormat("\\u{0:x4}", (int)c);
                        else sb.Append(c);
                        break;
                }
            }
            sb.Append("\"");
            return sb.ToString();
        }

        private static Options ParseArgs(string[] args)
        {
            var opts = new Options();
            int i = 0;
            while (i < args.Length)
            {
                string a = args[i];
                if (a == "--")
                {
                    i++;
                    while (i < args.Length) opts.Cmd.Add(args[i++]);
                    break;
                }
                if (a == "--mode" && i + 1 < args.Length) { opts.Mode = args[++i]; }
                else if (a == "--workdir" && i + 1 < args.Length) { opts.WorkDir = args[++i]; }
                else if (a == "--writable") { opts.WritableWorkDir = true; }
                else if (a == "--timeout-ms" && i + 1 < args.Length) { opts.TimeoutMs = int.Parse(args[++i]); }
                else if (a == "--memory-mb" && i + 1 < args.Length) { opts.MemoryMb = int.Parse(args[++i]); }
                else if (a == "--max-procs" && i + 1 < args.Length) { opts.MaxProcs = int.Parse(args[++i]); }
                else if (a == "--max-output-bytes" && i + 1 < args.Length) { opts.MaxOutputBytes = int.Parse(args[++i]); }
                else if (a == "--ro-dir" && i + 1 < args.Length) { opts.ReadOnlyDirs.Add(args[++i]); }
                else
                {
                    throw new ArgumentException("Unknown argument: " + a);
                }
                i++;
            }
            if (opts.Cmd.Count == 0) throw new ArgumentException("Missing command after --");
            return opts;
        }

        private static string SidToString(IntPtr pSid)
        {
            IntPtr ptr;
            if (!Native.ConvertSidToStringSidW(pSid, out ptr))
                throw new Win32Exception(Marshal.GetLastWin32Error());
            try
            {
                return Marshal.PtrToStringUni(ptr);
            }
            finally
            {
                Native.LocalFree(ptr);
            }
        }

        private static void EnsureAllAppPackagesReadAccess(string dirPath)
        {
            if (string.IsNullOrEmpty(dirPath) || !Directory.Exists(dirPath)) return;
            var allAppPkg = new SecurityIdentifier("S-1-15-2-1");
            var info = new DirectoryInfo(dirPath);
            var security = info.GetAccessControl();
            foreach (FileSystemAccessRule existing in security.GetAccessRules(true, true, typeof(SecurityIdentifier)))
            {
                if (existing.IdentityReference.Equals(allAppPkg) &&
                    existing.AccessControlType == AccessControlType.Allow &&
                    (existing.FileSystemRights & FileSystemRights.ReadAndExecute) == FileSystemRights.ReadAndExecute)
                {
                    return;
                }
            }
            var rule = new FileSystemAccessRule(
                allAppPkg,
                FileSystemRights.ReadAndExecute | FileSystemRights.ListDirectory | FileSystemRights.Read,
                InheritanceFlags.ContainerInherit | InheritanceFlags.ObjectInherit,
                PropagationFlags.None,
                AccessControlType.Allow);
            security.AddAccessRule(rule);
            info.SetAccessControl(security);
        }

        private static void GrantDirectoryAccess(string dirPath, SecurityIdentifier sid, FileSystemRights rights)
        {
            if (string.IsNullOrEmpty(dirPath) || !Directory.Exists(dirPath)) return;
            var info = new DirectoryInfo(dirPath);
            var security = new DirectorySecurity();
            security.SetAccessRuleProtection(true, false);

            var currentUser = WindowsIdentity.GetCurrent().User;
            var systemSid = new SecurityIdentifier(WellKnownSidType.LocalSystemSid, null);

            security.AddAccessRule(new FileSystemAccessRule(
                systemSid,
                FileSystemRights.FullControl,
                InheritanceFlags.ContainerInherit | InheritanceFlags.ObjectInherit,
                PropagationFlags.None,
                AccessControlType.Allow));

            if (currentUser != null)
            {
                security.AddAccessRule(new FileSystemAccessRule(
                    currentUser,
                    FileSystemRights.FullControl,
                    InheritanceFlags.ContainerInherit | InheritanceFlags.ObjectInherit,
                    PropagationFlags.None,
                    AccessControlType.Allow));
            }

            security.AddAccessRule(new FileSystemAccessRule(
                sid,
                rights,
                InheritanceFlags.ContainerInherit | InheritanceFlags.ObjectInherit,
                PropagationFlags.None,
                AccessControlType.Allow));

            info.SetAccessControl(security);
        }

        private static void SetLowIntegrityOnDesktop(string desktopObjectName)
        {
            IntPtr pLowSid;
            if (!Native.ConvertStringSidToSidW("S-1-16-4096", out pLowSid))
                return;
            IntPtr pSacl = Marshal.AllocHGlobal(256);
            try
            {
                if (Native.InitializeAcl(pSacl, 256, Native.ACL_REVISION) &&
                    Native.AddMandatoryAce(
                        pSacl,
                        Native.ACL_REVISION,
                        0,
                        Native.SYSTEM_MANDATORY_LABEL_NO_WRITE_UP,
                        pLowSid))
                {
                    Native.SetNamedSecurityInfoW(
                        desktopObjectName,
                        Native.SE_WINDOW_OBJECT,
                        Native.LABEL_SECURITY_INFORMATION,
                        IntPtr.Zero,
                        IntPtr.Zero,
                        IntPtr.Zero,
                        pSacl);
                }
            }
            finally
            {
                Marshal.FreeHGlobal(pSacl);
                Native.LocalFree(pLowSid);
            }
        }

        private static void SetLowIntegrityLabelOnDir(string dirPath)
        {
            if (string.IsNullOrEmpty(dirPath) || !Directory.Exists(dirPath)) return;
            IntPtr pLowSid;
            if (!Native.ConvertStringSidToSidW("S-1-16-4096", out pLowSid))
                throw new Win32Exception(Marshal.GetLastWin32Error());
            IntPtr pSacl = Marshal.AllocHGlobal(256);
            try
            {
                if (!Native.InitializeAcl(pSacl, 256, Native.ACL_REVISION))
                    throw new Win32Exception(Marshal.GetLastWin32Error());
                if (!Native.AddMandatoryAce(
                    pSacl,
                    Native.ACL_REVISION,
                    Native.OBJECT_INHERIT_ACE | Native.CONTAINER_INHERIT_ACE,
                    Native.SYSTEM_MANDATORY_LABEL_NO_WRITE_UP,
                    pLowSid))
                    throw new Win32Exception(Marshal.GetLastWin32Error());
                uint res = Native.SetNamedSecurityInfoW(
                    dirPath,
                    Native.SE_FILE_OBJECT,
                    Native.LABEL_SECURITY_INFORMATION,
                    IntPtr.Zero,
                    IntPtr.Zero,
                    IntPtr.Zero,
                    pSacl);
                if (res != 0)
                    throw new Win32Exception((int)res, "SetNamedSecurityInfoW failed");
            }
            finally
            {
                Marshal.FreeHGlobal(pSacl);
                Native.LocalFree(pLowSid);
            }
        }

        private static IntPtr CreateWriteRestrictedToken()
        {
            IntPtr hToken;
            if (!Native.OpenProcessToken(Native.GetCurrentProcess(), Native.TOKEN_ALL_ACCESS, out hToken))
                throw new Win32Exception(Marshal.GetLastWin32Error(), "OpenProcessToken failed");
            IntPtr hRestricted = IntPtr.Zero;
            IntPtr pRestrictedSid = IntPtr.Zero;
            IntPtr pSidArray = IntPtr.Zero;
            try
            {
                if (!Native.ConvertStringSidToSidW("S-1-5-12", out pRestrictedSid))
                    throw new Win32Exception(Marshal.GetLastWin32Error(), "ConvertStringSidToSidW(S-1-5-12) failed");

                var restrictAttr = new Native.SID_AND_ATTRIBUTES
                {
                    Sid = pRestrictedSid,
                    Attributes = 0
                };
                int structSize = Marshal.SizeOf(typeof(Native.SID_AND_ATTRIBUTES));
                pSidArray = Marshal.AllocHGlobal(structSize);
                Marshal.StructureToPtr(restrictAttr, pSidArray, false);

                if (!Native.CreateRestrictedToken(
                    hToken,
                    Native.DISABLE_MAX_PRIVILEGE | Native.WRITE_RESTRICTED,
                    0, IntPtr.Zero, 0, IntPtr.Zero, 1, pSidArray,
                    out hRestricted))
                    throw new Win32Exception(Marshal.GetLastWin32Error(), "CreateRestrictedToken(WRITE_RESTRICTED) failed");

                IntPtr result = hRestricted;
                hRestricted = IntPtr.Zero;
                return result;
            }
            finally
            {
                if (pSidArray != IntPtr.Zero) Marshal.FreeHGlobal(pSidArray);
                if (pRestrictedSid != IntPtr.Zero) Native.LocalFree(pRestrictedSid);
                if (hRestricted != IntPtr.Zero) Native.CloseHandle(hRestricted);
                Native.CloseHandle(hToken);
            }
        }

        private static IntPtr CreateLowIntegrityRestrictedToken(bool useLowIntegrity)
        {
            IntPtr hToken;
            if (!Native.OpenProcessToken(Native.GetCurrentProcess(), Native.TOKEN_ALL_ACCESS, out hToken))
                throw new Win32Exception(Marshal.GetLastWin32Error(), "OpenProcessToken failed");
            IntPtr hRestricted = IntPtr.Zero;
            IntPtr pLowSid = IntPtr.Zero;
            IntPtr pTml = IntPtr.Zero;
            try
            {
                if (!Native.CreateRestrictedToken(
                    hToken,
                    Native.DISABLE_MAX_PRIVILEGE,
                    0, IntPtr.Zero, 0, IntPtr.Zero, 0, IntPtr.Zero,
                    out hRestricted))
                    throw new Win32Exception(Marshal.GetLastWin32Error(), "CreateRestrictedToken failed");

                if (useLowIntegrity)
                {
                    if (!Native.ConvertStringSidToSidW("S-1-16-4096", out pLowSid))
                        throw new Win32Exception(Marshal.GetLastWin32Error(), "ConvertStringSidToSidW failed");

                    var tml = new Native.TOKEN_MANDATORY_LABEL
                    {
                        Label = new Native.SID_AND_ATTRIBUTES
                        {
                            Sid = pLowSid,
                            Attributes = Native.SE_GROUP_INTEGRITY
                        }
                    };
                    int tmlSize = Marshal.SizeOf(typeof(Native.TOKEN_MANDATORY_LABEL));
                    pTml = Marshal.AllocHGlobal(tmlSize);
                    Marshal.StructureToPtr(tml, pTml, false);

                    if (!Native.SetTokenInformation(hRestricted, Native.TokenIntegrityLevel, pTml, (uint)tmlSize))
                        throw new Win32Exception(Marshal.GetLastWin32Error(), "SetTokenInformation(LowIL) failed");
                }

                IntPtr result = hRestricted;
                hRestricted = IntPtr.Zero;
                return result;
            }
            finally
            {
                if (pTml != IntPtr.Zero) Marshal.FreeHGlobal(pTml);
                if (pLowSid != IntPtr.Zero) Native.LocalFree(pLowSid);
                if (hRestricted != IntPtr.Zero) Native.CloseHandle(hRestricted);
                Native.CloseHandle(hToken);
            }
        }

        private static void ReadPipeLimited(
            IntPtr hReadPipe,
            int maxBytes,
            ref int totalSharedBytes,
            object syncObj,
            MemoryStream dest,
            ref bool truncated,
            Action onLimitExceeded)
        {
            byte[] buffer = new byte[8192];
            using (var fs = new FileStream(new Microsoft.Win32.SafeHandles.SafeFileHandle(hReadPipe, true), FileAccess.Read, 8192, false))
            {
                while (true)
                {
                    int read = fs.Read(buffer, 0, buffer.Length);
                    if (read <= 0) break;

                    bool exceed = false;
                    lock (syncObj)
                    {
                        int remaining = maxBytes - totalSharedBytes;
                        if (remaining > 0)
                        {
                            int take = Math.Min(remaining, read);
                            dest.Write(buffer, 0, take);
                            totalSharedBytes += take;
                            if (read > remaining)
                            {
                                truncated = true;
                                exceed = true;
                            }
                        }
                        else
                        {
                            truncated = true;
                            exceed = true;
                        }
                    }

                    if (exceed)
                    {
                        onLimitExceeded();
                        break;
                    }
                }
            }
        }

        public static int Main(string[] args)
        {
            if (args.Length > 0 && args[0] == "--ensure-ro")
            {
                for (int i = 1; i < args.Length; i++)
                {
                    try { EnsureAllAppPackagesReadAccess(args[i]); } catch { }
                }
                Console.WriteLine("{\"ok\":true}");
                return 0;
            }

            if (args.Length > 0 && args[0] == "--self-test")
            {
                IntPtr hJobTest = Native.CreateJobObject(IntPtr.Zero, null);
                if (hJobTest == IntPtr.Zero) return 2;
                Native.CloseHandle(hJobTest);

                string probeName = "PetPrep.Probe." + Environment.UserName.Replace("\\", "_");
                IntPtr pSid;
                int hr = Native.DeriveAppContainerSidFromAppContainerName(probeName, out pSid);
                if (hr != 0 || pSid == IntPtr.Zero)
                {
                    hr = Native.CreateAppContainerProfile(probeName, "PET Probe", "Probe", IntPtr.Zero, 0, out pSid);
                }
                if (pSid != IntPtr.Zero) Native.FreeSid(pSid);
                Console.WriteLine("{\"ok\":true,\"appContainer\":" + (hr == 0 ? "true" : "false") + "}");
                return hr == 0 ? 0 : 3;
            }

            Options opts = ParseArgs(args);
            Native.SetErrorMode(Native.SEM_FAILCRITICALERRORS | Native.SEM_NOGPFAULTERRORBOX | Native.SEM_NOOPENFILEERRORBOX);

            IntPtr hJob = IntPtr.Zero;
            IntPtr pAttrList = IntPtr.Zero;
            IntPtr acSid = IntPtr.Zero;
            IntPtr hRestrictedToken = IntPtr.Zero;
            IntPtr hSandboxDesktop = IntPtr.Zero;
            string sandboxDesktopName = null;
            IntPtr hInRead = IntPtr.Zero, hInWrite = IntPtr.Zero;
            IntPtr hOutRead = IntPtr.Zero, hOutWrite = IntPtr.Zero;
            IntPtr hErrRead = IntPtr.Zero, hErrWrite = IntPtr.Zero;
            IntPtr hProcess = IntPtr.Zero, hThread = IntPtr.Zero;
            string acProfileName = null;

            bool timedOut = false;
            bool outputTruncated = false;
            bool memoryExceeded = false;
            uint exitCode = 1;
            long peakMemoryBytes = 0;

            var stdoutMs = new MemoryStream();
            var stderrMs = new MemoryStream();
            var sw = Stopwatch.StartNew();

            try
            {
                hJob = Native.CreateJobObject(IntPtr.Zero, null);
                if (hJob == IntPtr.Zero) throw new Win32Exception(Marshal.GetLastWin32Error());

                ulong memBytes = (ulong)Math.Max(64, opts.MemoryMb) * 1024UL * 1024UL;
                var extInfo = new Native.JOBOBJECT_EXTENDED_LIMIT_INFORMATION();
                extInfo.BasicLimitInformation.LimitFlags =
                    Native.JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE |
                    Native.JOB_OBJECT_LIMIT_DIE_ON_UNHANDLED_EXCEPTION |
                    Native.JOB_OBJECT_LIMIT_PROCESS_MEMORY |
                    Native.JOB_OBJECT_LIMIT_JOB_MEMORY |
                    Native.JOB_OBJECT_LIMIT_ACTIVE_PROCESS |
                    Native.JOB_OBJECT_LIMIT_JOB_TIME;
                extInfo.BasicLimitInformation.PerJobUserTimeLimit = (long)opts.TimeoutMs * 2L * 10000L;
                extInfo.BasicLimitInformation.ActiveProcessLimit = (uint)Math.Max(1, opts.MaxProcs);
                extInfo.ProcessMemoryLimit = (UIntPtr)memBytes;
                extInfo.JobMemoryLimit = (UIntPtr)memBytes;

                int extSize = Marshal.SizeOf(typeof(Native.JOBOBJECT_EXTENDED_LIMIT_INFORMATION));
                IntPtr pExt = Marshal.AllocHGlobal(extSize);
                try
                {
                    Marshal.StructureToPtr(extInfo, pExt, false);
                    if (!Native.SetInformationJobObject(hJob, Native.JobObjectExtendedLimitInformation, pExt, (uint)extSize))
                        throw new Win32Exception(Marshal.GetLastWin32Error());
                }
                finally
                {
                    Marshal.FreeHGlobal(pExt);
                }

                // UI restrictions are enforced via AppContainer / Restricted Token boundaries;
                // JobObjectBasicUIRestrictions can cause STATUS_DLL_INIT_FAILED (0xC0000142) on tools linking user32.dll.

                bool useAppContainer = string.Equals(opts.Mode, "appcontainer", StringComparison.OrdinalIgnoreCase);
                bool useRestricted = string.Equals(opts.Mode, "restricted", StringComparison.OrdinalIgnoreCase);
                bool usePrivRestricted = string.Equals(opts.Mode, "restricted-med", StringComparison.OrdinalIgnoreCase);

                if (useAppContainer)
                {
                    acProfileName = "PetPrep.Run." + Guid.NewGuid().ToString("N");
                    int hr = Native.CreateAppContainerProfile(
                        acProfileName,
                        "PET Sandbox Run",
                        "Isolated execution profile",
                        IntPtr.Zero,
                        0,
                        out acSid);
                    if (hr != 0 || acSid == IntPtr.Zero)
                        throw new Win32Exception(hr, "CreateAppContainerProfile failed");

                    var sidObj = new SecurityIdentifier(SidToString(acSid));
                    FileSystemRights workRights = opts.WritableWorkDir
                        ? FileSystemRights.FullControl
                        : (FileSystemRights.ReadAndExecute | FileSystemRights.ListDirectory | FileSystemRights.Read);
                    GrantDirectoryAccess(opts.WorkDir, sidObj, workRights);
                    if (opts.WritableWorkDir)
                    {
                        string tmpSub = Path.Combine(opts.WorkDir, "tmp");
                        Directory.CreateDirectory(tmpSub);
                        Environment.SetEnvironmentVariable("TMP", tmpSub);
                        Environment.SetEnvironmentVariable("TEMP", tmpSub);
                        Environment.SetEnvironmentVariable("TMPDIR", tmpSub);
                    }
                    else
                    {
                        Environment.SetEnvironmentVariable("TMP", opts.WorkDir);
                        Environment.SetEnvironmentVariable("TEMP", opts.WorkDir);
                    }

                    foreach (string roDir in opts.ReadOnlyDirs)
                    {
                        try
                        {
                            EnsureAllAppPackagesReadAccess(roDir);
                        }
                        catch
                        {
                            // Ignore dirs owned by SYSTEM/TrustedInstaller
                        }
                    }
                }
                else if (useRestricted || usePrivRestricted)
                {
                    hRestrictedToken = useRestricted
                        ? CreateWriteRestrictedToken()
                        : CreateLowIntegrityRestrictedToken(false);
                    if (opts.WritableWorkDir)
                    {
                        var restrictedSid = new SecurityIdentifier(WellKnownSidType.RestrictedCodeSid, null);
                        GrantDirectoryAccess(opts.WorkDir, restrictedSid, FileSystemRights.FullControl);
                        string outSub = Path.Combine(opts.WorkDir, "out");
                        if (Directory.Exists(outSub))
                        {
                            GrantDirectoryAccess(outSub, restrictedSid, FileSystemRights.FullControl);
                        }
                        string tmpSub = Path.Combine(opts.WorkDir, "tmp");
                        Directory.CreateDirectory(tmpSub);
                        GrantDirectoryAccess(tmpSub, restrictedSid, FileSystemRights.FullControl);
                        Environment.SetEnvironmentVariable("TMP", tmpSub);
                        Environment.SetEnvironmentVariable("TEMP", tmpSub);
                        Environment.SetEnvironmentVariable("TMPDIR", tmpSub);
                    }
                    else
                    {
                        var restrictedSid = new SecurityIdentifier(WellKnownSidType.RestrictedCodeSid, null);
                        GrantDirectoryAccess(
                            opts.WorkDir,
                            restrictedSid,
                            FileSystemRights.ReadAndExecute | FileSystemRights.ListDirectory | FileSystemRights.Read);
                        Environment.SetEnvironmentVariable("TMP", opts.WorkDir);
                        Environment.SetEnvironmentVariable("TEMP", opts.WorkDir);
                    }
                }

                var sa = new Native.SECURITY_ATTRIBUTES
                {
                    nLength = Marshal.SizeOf(typeof(Native.SECURITY_ATTRIBUTES)),
                    lpSecurityDescriptor = IntPtr.Zero,
                    bInheritHandle = true,
                };
                if (!Native.CreatePipe(out hInRead, out hInWrite, ref sa, 0)) throw new Win32Exception(Marshal.GetLastWin32Error());
                if (!Native.CreatePipe(out hOutRead, out hOutWrite, ref sa, 0)) throw new Win32Exception(Marshal.GetLastWin32Error());
                if (!Native.CreatePipe(out hErrRead, out hErrWrite, ref sa, 0)) throw new Win32Exception(Marshal.GetLastWin32Error());

                Native.SetHandleInformation(hInWrite, Native.HANDLE_FLAG_INHERIT, 0);
                Native.SetHandleInformation(hOutRead, Native.HANDLE_FLAG_INHERIT, 0);
                Native.SetHandleInformation(hErrRead, Native.HANDLE_FLAG_INHERIT, 0);

                int attrCount = useAppContainer ? 2 : 1;
                IntPtr attrSize = IntPtr.Zero;
                Native.InitializeProcThreadAttributeList(IntPtr.Zero, attrCount, 0, ref attrSize);
                pAttrList = Marshal.AllocHGlobal(attrSize);
                if (!Native.InitializeProcThreadAttributeList(pAttrList, attrCount, 0, ref attrSize))
                    throw new Win32Exception(Marshal.GetLastWin32Error());

                IntPtr[] inheritHandles = new[] { hInRead, hOutWrite, hErrWrite };
                IntPtr pHandleArray = Marshal.AllocHGlobal(IntPtr.Size * inheritHandles.Length);
                Marshal.Copy(inheritHandles, 0, pHandleArray, inheritHandles.Length);
                if (!Native.UpdateProcThreadAttribute(
                    pAttrList,
                    0,
                    Native.PROC_THREAD_ATTRIBUTE_HANDLE_LIST,
                    pHandleArray,
                    (IntPtr)(IntPtr.Size * inheritHandles.Length),
                    IntPtr.Zero,
                    IntPtr.Zero))
                    throw new Win32Exception(Marshal.GetLastWin32Error());

                IntPtr pSecCaps = IntPtr.Zero;
                if (useAppContainer)
                {
                    var secCaps = new Native.SECURITY_CAPABILITIES
                    {
                        AppContainerSid = acSid,
                        Capabilities = IntPtr.Zero,
                        CapabilityCount = 0,
                        Reserved = 0
                    };
                    pSecCaps = Marshal.AllocHGlobal(Marshal.SizeOf(typeof(Native.SECURITY_CAPABILITIES)));
                    Marshal.StructureToPtr(secCaps, pSecCaps, false);
                    if (!Native.UpdateProcThreadAttribute(
                        pAttrList,
                        0,
                        Native.PROC_THREAD_ATTRIBUTE_SECURITY_CAPABILITIES,
                        pSecCaps,
                        (IntPtr)Marshal.SizeOf(typeof(Native.SECURITY_CAPABILITIES)),
                        IntPtr.Zero,
                        IntPtr.Zero))
                        throw new Win32Exception(Marshal.GetLastWin32Error());
                }

                var si = new Native.STARTUPINFOEX();
                si.StartupInfo.cb = Marshal.SizeOf(typeof(Native.STARTUPINFOEX));
                si.StartupInfo.lpDesktop = hSandboxDesktop != IntPtr.Zero ? ("WinSta0\\" + sandboxDesktopName) : null;
                si.StartupInfo.dwFlags = Native.STARTF_USESTDHANDLES;
                si.StartupInfo.hStdInput = hInRead;
                si.StartupInfo.hStdOutput = hOutWrite;
                si.StartupInfo.hStdError = hErrWrite;
                si.lpAttributeList = pAttrList;

                var cmdSb = new StringBuilder();
                for (int c = 0; c < opts.Cmd.Count; c++)
                {
                    if (c > 0) cmdSb.Append(' ');
                    cmdSb.Append(QuoteArg(opts.Cmd[c]));
                }

                uint flags = Native.EXTENDED_STARTUPINFO_PRESENT | 0x00000008u | Native.CREATE_SUSPENDED | Native.CREATE_UNICODE_ENVIRONMENT;
                Native.PROCESS_INFORMATION pi;
                bool created = (useRestricted || usePrivRestricted)
                    ? Native.CreateProcessAsUserW(
                        hRestrictedToken,
                        null,
                        cmdSb,
                        IntPtr.Zero,
                        IntPtr.Zero,
                        true,
                        flags,
                        IntPtr.Zero,
                        opts.WorkDir,
                        ref si,
                        out pi)
                    : Native.CreateProcessW(
                        null,
                        cmdSb,
                        IntPtr.Zero,
                        IntPtr.Zero,
                        true,
                        flags,
                        IntPtr.Zero,
                        opts.WorkDir,
                        ref si,
                        out pi);

                Marshal.FreeHGlobal(pHandleArray);
                if (pSecCaps != IntPtr.Zero) Marshal.FreeHGlobal(pSecCaps);

                if (!created)
                {
                    int w32Err = Marshal.GetLastWin32Error();
                    throw new Win32Exception(w32Err, "CreateProcess failed (Win32=" + w32Err + "): " + new Win32Exception(w32Err).Message);
                }

                hProcess = pi.hProcess;
                hThread = pi.hThread;

                if (!Native.AssignProcessToJobObject(hJob, hProcess))
                {
                    Native.TerminateJobObject(hJob, 1);
                    throw new Win32Exception(Marshal.GetLastWin32Error(), "AssignProcessToJobObject failed");
                }

                Native.CloseHandle(hInRead); hInRead = IntPtr.Zero;
                Native.CloseHandle(hOutWrite); hOutWrite = IntPtr.Zero;
                Native.CloseHandle(hErrWrite); hErrWrite = IntPtr.Zero;

                sw.Restart();
                Native.ResumeThread(hThread);

                Task stdinTask = Task.Run(() =>
                {
                    try
                    {
                        using (var inStream = Console.OpenStandardInput())
                        using (var childIn = new FileStream(new Microsoft.Win32.SafeHandles.SafeFileHandle(hInWrite, true), FileAccess.Write, 8192, false))
                        {
                            hInWrite = IntPtr.Zero;
                            inStream.CopyTo(childIn);
                        }
                    }
                    catch
                    {
                    }
                });

                int sharedOutputBytes = 0;
                object syncObj = new object();
                Action killForOutput = () =>
                {
                    try { Native.TerminateJobObject(hJob, 137); } catch { }
                };

                IntPtr outR = hOutRead; hOutRead = IntPtr.Zero;
                IntPtr errR = hErrRead; hErrRead = IntPtr.Zero;

                Task outTask = Task.Run(() => ReadPipeLimited(outR, opts.MaxOutputBytes, ref sharedOutputBytes, syncObj, stdoutMs, ref outputTruncated, killForOutput));
                Task errTask = Task.Run(() => ReadPipeLimited(errR, opts.MaxOutputBytes, ref sharedOutputBytes, syncObj, stderrMs, ref outputTruncated, killForOutput));

                uint waitRes = Native.WaitForSingleObject(hProcess, (uint)Math.Max(100, opts.TimeoutMs));
                if (waitRes == 0x00000102)
                {
                    timedOut = true;
                    Native.TerminateJobObject(hJob, 124);
                    Native.WaitForSingleObject(hProcess, 2000);
                }

                Native.TerminateJobObject(hJob, 0);

                Task.WaitAll(new[] { outTask, errTask }, 2000);
                try { stdinTask.Wait(200); } catch { }
                sw.Stop();

                Native.GetExitCodeProcess(hProcess, out exitCode);

                int qSize = Marshal.SizeOf(typeof(Native.JOBOBJECT_EXTENDED_LIMIT_INFORMATION));
                IntPtr pQuery = Marshal.AllocHGlobal(qSize);
                try
                {
                    uint retLen;
                    if (Native.QueryInformationJobObject(hJob, Native.JobObjectExtendedLimitInformation, pQuery, (uint)qSize, out retLen))
                    {
                        var queried = (Native.JOBOBJECT_EXTENDED_LIMIT_INFORMATION)Marshal.PtrToStructure(pQuery, typeof(Native.JOBOBJECT_EXTENDED_LIMIT_INFORMATION));
                        peakMemoryBytes = (long)queried.PeakProcessMemoryUsed.ToUInt64();
                        if (peakMemoryBytes >= (long)memBytes * 98 / 100 && exitCode != 0)
                        {
                            memoryExceeded = true;
                        }
                    }
                }
                finally
                {
                    Marshal.FreeHGlobal(pQuery);
                }
            }
            catch (Exception ex)
            {
                byte[] msg = Encoding.UTF8.GetBytes(ex.Message);
                stderrMs.Write(msg, 0, msg.Length);
                exitCode = 1;
            }
            finally
            {
                if (hJob != IntPtr.Zero)
                {
                    try { Native.TerminateJobObject(hJob, 0); } catch { }
                    Native.CloseHandle(hJob);
                }
                if (hThread != IntPtr.Zero) Native.CloseHandle(hThread);
                if (hProcess != IntPtr.Zero) Native.CloseHandle(hProcess);
                if (hInRead != IntPtr.Zero) Native.CloseHandle(hInRead);
                if (hInWrite != IntPtr.Zero) Native.CloseHandle(hInWrite);
                if (hOutRead != IntPtr.Zero) Native.CloseHandle(hOutRead);
                if (hOutWrite != IntPtr.Zero) Native.CloseHandle(hOutWrite);
                if (hErrRead != IntPtr.Zero) Native.CloseHandle(hErrRead);
                if (hErrWrite != IntPtr.Zero) Native.CloseHandle(hErrWrite);
                if (pAttrList != IntPtr.Zero)
                {
                    Native.DeleteProcThreadAttributeList(pAttrList);
                    Marshal.FreeHGlobal(pAttrList);
                }
                if (acSid != IntPtr.Zero) Native.FreeSid(acSid);
                if (hRestrictedToken != IntPtr.Zero) Native.CloseHandle(hRestrictedToken);
                if (hSandboxDesktop != IntPtr.Zero) Native.CloseDesktop(hSandboxDesktop);
                if (acProfileName != null)
                {
                    try { Native.DeleteAppContainerProfile(acProfileName); } catch { }
                }
            }

            string outB64 = Convert.ToBase64String(stdoutMs.ToArray());
            string errB64 = Convert.ToBase64String(stderrMs.ToArray());
            long memoryKb = peakMemoryBytes > 0 ? peakMemoryBytes / 1024L : 0L;

            Console.WriteLine(
                "{" +
                "\"exitCode\":" + exitCode + "," +
                "\"timeMs\":" + Math.Max(1L, sw.ElapsedMilliseconds) + "," +
                "\"timedOut\":" + (timedOut ? "true" : "false") + "," +
                "\"memoryExceeded\":" + (memoryExceeded ? "true" : "false") + "," +
                "\"outputTruncated\":" + (outputTruncated ? "true" : "false") + "," +
                "\"memoryKb\":" + memoryKb + "," +
                "\"stdoutB64\":" + JsonEscape(outB64) + "," +
                "\"stderrB64\":" + JsonEscape(errB64) +
                "}"
            );
            return 0;
        }
    }
}
