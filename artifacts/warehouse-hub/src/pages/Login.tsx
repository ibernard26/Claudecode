import { useQueryClient } from "@tanstack/react-query";
import { 
  useListDemoUsers, 
  useLoginUser, 
  getGetCurrentUserQueryKey 
} from "@workspace/api-client-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useState } from "react";
import { Package } from "lucide-react";
import { useLocation } from "wouter";

export default function Login() {
  const { data: demoUsers, isLoading: loadingUsers } = useListDemoUsers();
  const loginUser = useLoginUser();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    loginUser.mutate(
      { data: { username, password } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetCurrentUserQueryKey() });
          setLocation("/");
        }
      }
    );
  };

  return (
    <div className="min-h-screen bg-muted/40 flex items-center justify-center p-4">
      <div className="max-w-4xl w-full grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
        <div className="flex flex-col gap-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="h-12 w-12 rounded-lg bg-primary flex items-center justify-center text-primary-foreground shadow-sm">
              <Package className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-3xl font-bold tracking-tight">Shoebill AI</h1>
              <p className="text-muted-foreground text-sm">Universal Warehouse Platform</p>
            </div>
          </div>
          
          <Card>
            <CardHeader>
              <CardTitle>Sign in</CardTitle>
              <CardDescription>Enter your credentials to access the hub.</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleLogin} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="username">Username</Label>
                  <Input 
                    id="username" 
                    value={username} 
                    onChange={(e) => setUsername(e.target.value)} 
                    placeholder="Enter username" 
                    required 
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <Input 
                    id="password" 
                    type="password" 
                    value={password} 
                    onChange={(e) => setPassword(e.target.value)} 
                    placeholder="Enter password" 
                    required 
                  />
                </div>
                <Button type="submit" className="w-full" disabled={loginUser.isPending}>
                  {loginUser.isPending ? "Signing in..." : "Sign in"}
                </Button>
                {loginUser.isError && (
                  <p className="text-sm text-destructive mt-2 text-center">Invalid credentials</p>
                )}
              </form>
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-col gap-4">
          <h2 className="text-lg font-semibold px-1">Demo Accounts</h2>
          <p className="text-sm text-muted-foreground px-1 mb-2">Click an account below to auto-fill credentials and preview role-based access.</p>
          
          <div className="grid gap-3">
            {loadingUsers ? (
              <div className="text-sm text-muted-foreground p-4 text-center">Loading demo accounts...</div>
            ) : (
              demoUsers?.map((user) => (
                <Card 
                  key={user.username}
                  className="cursor-pointer hover-elevate transition-colors border-border/50 hover:border-primary/50"
                  onClick={() => {
                    setUsername(user.username);
                    setPassword(user.password);
                  }}
                >
                  <CardContent className="p-4 flex items-center justify-between">
                    <div>
                      <div className="font-medium">{user.displayName}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {user.scopeLabel || "Global Access"}
                      </div>
                    </div>
                    <Badge variant={user.role === 'admin' ? 'default' : 'secondary'} className="capitalize">
                      {user.role.replace('_', ' ')}
                    </Badge>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
