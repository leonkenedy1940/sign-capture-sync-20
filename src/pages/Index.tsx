import React, { useState, useEffect } from 'react';
import { SignRecorder } from '@/components/SignRecorder';
import { SignDetector } from '@/components/SignDetector';
import { SignLibrary } from '@/components/SignLibrary';
import { signDatabase } from '@/lib/indexeddb';
import { useToast } from '@/hooks/use-toast';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Hand, Video, Library, Search } from 'lucide-react';

const Index = () => {
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const { toast } = useToast();

  useEffect(() => {
    // Initialize database
    signDatabase.initialize().catch((error) => {
      console.error('Failed to initialize database:', error);
      toast({
        title: "Error de base de datos",
        description: "No se pudo inicializar el almacenamiento local",
        variant: "destructive",
      });
    });
  }, [toast]);

  const handleSignSaved = () => {
    setRefreshTrigger(prev => prev + 1);
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border/50 bg-card/50 backdrop-blur">
        <div className="container mx-auto px-4 py-6">
          <div className="text-center space-y-4">
            <div className="flex items-center justify-center gap-3">
              <div className="p-3 rounded-full bg-gradient-tech shadow-glow-tech">
                <Hand className="w-8 h-8 text-primary-foreground" />
              </div>
            <h1 className="text-4xl font-bold bg-gradient-tech bg-clip-text text-transparent">
              Sistema de Señas
            </h1>
            </div>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              Sistema completo para grabar, detectar y analizar señas dinámicas con IA
            </p>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="container mx-auto px-4 py-8">
        <Tabs defaultValue="record" className="space-y-8">
          <TabsList className="grid w-full grid-cols-3 max-w-lg mx-auto">
            <TabsTrigger value="record" className="flex items-center gap-2">
              <Video className="w-4 h-4" />
              Grabar
            </TabsTrigger>
            <TabsTrigger value="detect" className="flex items-center gap-2">
              <Search className="w-4 h-4" />
              Detectar
            </TabsTrigger>
            <TabsTrigger value="library" className="flex items-center gap-2">
              <Library className="w-4 h-4" />
              Biblioteca
            </TabsTrigger>
          </TabsList>

          <TabsContent value="record" className="space-y-6">
            <SignRecorder onSignSaved={handleSignSaved} />
          </TabsContent>

          <TabsContent value="detect" className="space-y-6">
            <SignDetector />
          </TabsContent>

          <TabsContent value="library" className="space-y-6">
            <SignLibrary refreshTrigger={refreshTrigger} />
          </TabsContent>
        </Tabs>
      </main>

      {/* Footer */}
      <footer className="border-t border-border/50 bg-card/50 backdrop-blur mt-16">
        <div className="container mx-auto px-4 py-6 text-center text-sm text-muted-foreground">
          <p>Sistema de captura de señas con detección de keypoints en tiempo real</p>
        </div>
      </footer>
    </div>
  );
};

export default Index;