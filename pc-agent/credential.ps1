param([ValidateSet('read','write','delete','protect','unprotect')][string]$Action,[string]$Target)
$ErrorActionPreference = 'Stop'
[Console]::InputEncoding = [Text.UTF8Encoding]::new($false)
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
Add-Type -AssemblyName System.Security
if ($Action -eq 'protect') {
  $bytes=[Text.Encoding]::UTF8.GetBytes([Console]::In.ReadToEnd())
  [Console]::Out.Write([Convert]::ToBase64String([Security.Cryptography.ProtectedData]::Protect($bytes,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser)))
  exit
}
if ($Action -eq 'unprotect') {
  $bytes=[Convert]::FromBase64String([Console]::In.ReadToEnd())
  [Console]::Out.Write([Text.Encoding]::UTF8.GetString([Security.Cryptography.ProtectedData]::Unprotect($bytes,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser)))
  exit
}
Add-Type @'
using System;
using System.Runtime.InteropServices;
using System.Text;
public static class AiCredential {
 [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)] struct Cred {
  public uint Flags; public uint Type; public string TargetName; public string Comment;
  public System.Runtime.InteropServices.ComTypes.FILETIME LastWritten;
  public uint CredentialBlobSize; public IntPtr CredentialBlob;
  public uint Persist; public uint AttributeCount; public IntPtr Attributes;
  public string TargetAlias; public string UserName;
 }
 [DllImport("advapi32", CharSet=CharSet.Unicode, SetLastError=true)] static extern bool CredWriteW(ref Cred c,uint flags);
 [DllImport("advapi32", CharSet=CharSet.Unicode, SetLastError=true)] static extern bool CredReadW(string target,uint type,uint flags,out IntPtr p);
 [DllImport("advapi32")] static extern void CredFree(IntPtr p);
 [DllImport("advapi32", CharSet=CharSet.Unicode, SetLastError=true)] static extern bool CredDeleteW(string target,uint type,uint flags);
 public static void Put(string target,string value) {
  byte[] bytes=Encoding.Unicode.GetBytes(value); IntPtr p=Marshal.AllocHGlobal(bytes.Length);
  try { Marshal.Copy(bytes,0,p,bytes.Length); Cred c=new Cred {Type=1,TargetName=target,UserName="household-ai",CredentialBlobSize=(uint)bytes.Length,CredentialBlob=p,Persist=2};
   if(!CredWriteW(ref c,0)) throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());
  } finally {Marshal.FreeHGlobal(p);}
 }
 public static string Get(string target) {
  IntPtr p; if(!CredReadW(target,1,0,out p)) {
   int error=Marshal.GetLastWin32Error();
   if(error==1168) return "";
   throw new System.ComponentModel.Win32Exception(error);
  }
  try {Cred c=(Cred)Marshal.PtrToStructure(p,typeof(Cred));return Marshal.PtrToStringUni(c.CredentialBlob,(int)c.CredentialBlobSize/2);} finally {CredFree(p);}
 }
 public static void Delete(string target) {CredDeleteW(target,1,0);}
}
'@
if ($Action -eq 'write') {[AiCredential]::Put($Target,[Console]::In.ReadToEnd())}
if ($Action -eq 'read') {[Console]::Out.Write([AiCredential]::Get($Target))}
if ($Action -eq 'delete') {[AiCredential]::Delete($Target)}
