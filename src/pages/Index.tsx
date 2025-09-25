import React, { useState, useEffect } from 'react';
import { SignRecorder } from '@/components/SignRecorder';
import { SignDetector } from '@/components/SignDetector';
import { SignLibrary } from '@/components/SignLibrary';
import { supabaseSignService } from '@/lib/supabaseSignService';
import { useToast } from '@/hooks/use-toast';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ConnectionStatus } from '@/components/ConnectionStatus';
import { Hand, Video, Library, Search, Smartphone } from 'lucide-react';

const Index = () => {
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [isInitialized, setIsInitialized] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    // Initialize Supabase service
    supabaseSignService.initialize().then(() => {
      setIsInitialized(true);
      console.log('🚀 Supabase inicializado correctamente');
    }).catch((error) => {
      console.error('❌ Error inicializando Supabase:', error);
      toast({
        title: "Error",
        description: "Error inicializando la aplicación",
        variant: "destructive",
      });
    });
  }, [toast]);

  const handleSignSaved = () => {
    setRefreshTrigger(prev => prev + 1);
  };

  if (!isInitialized) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p>Inicializando Supabase...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header - Responsive */}
      <header className="border-b border-border/50 bg-card/50 backdrop-blur">
        <div className="container mx-auto px-3 sm:px-4 py-4 sm:py-6">
          <div className="text-center space-y-3 sm:space-y-4">
            <div className="flex items-center justify-between w-full">
              <div className="flex items-center justify-center gap-2 sm:gap-3">
                <div className="p-2 sm:p-3 rounded-full bg-gradient-tech shadow-glow-tech">
                  <Hand className="w-6 h-6 sm:w-8 sm:h-8 text-primary-foreground" />
                </div>
              <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold bg-gradient-tech bg-clip-text text-transparent">
                Sistema de Señas
              </h1>
              </div>
              <div className="hidden sm:flex">
                <ConnectionStatus />
              </div>
            </div>
            <p className="text-base sm:text-lg lg:text-xl text-muted-foreground max-w-2xl mx-auto px-4">
              Sistema completo para grabar, detectar y analizar señas dinámicas con IA
            </p>
            <div className="flex justify-center sm:hidden">
              <ConnectionStatus />
            </div>
          </div>
        </div>
      </header>

      {/* Main content - Responsive */}
      <main className="container mx-auto px-3 sm:px-4 py-6 sm:py-8">
        <Tabs defaultValue="record" className="space-y-6 sm:space-y-8">
          {/* Responsive tab navigation */}
          <TabsList className="grid w-full grid-cols-3 max-w-sm sm:max-w-lg mx-auto h-auto">
            <TabsTrigger value="record" className="flex flex-col sm:flex-row items-center gap-1 sm:gap-2 p-2 sm:p-3 text-xs sm:text-sm">
              <Video className="w-3 h-3 sm:w-4 sm:h-4" />
              <span>Grabar</span>
            </TabsTrigger>
            <TabsTrigger value="detect" className="flex flex-col sm:flex-row items-center gap-1 sm:gap-2 p-2 sm:p-3 text-xs sm:text-sm">
              <Search className="w-3 h-3 sm:w-4 sm:h-4" />
              <span>Detectar</span>
            </TabsTrigger>
            <TabsTrigger value="library" className="flex flex-col sm:flex-row items-center gap-1 sm:gap-2 p-2 sm:p-3 text-xs sm:text-sm">
              <Library className="w-3 h-3 sm:w-4 sm:h-4" />
              <span>Biblioteca</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="record" className="space-y-4 sm:space-y-6">
            <SignRecorder onSignSaved={handleSignSaved} />
          </TabsContent>

          <TabsContent value="detect" className="space-y-4 sm:space-y-6">
            <SignDetector />
          </TabsContent>

          <TabsContent value="library" className="space-y-4 sm:space-y-6">
            <SignLibrary refreshTrigger={refreshTrigger} />
          </TabsContent>
        </Tabs>

        {/* Mobile optimization indicator */}
        <div className="flex justify-center mt-8 sm:hidden">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Smartphone className="w-3 h-3" />
            <span>Interfaz optimizada para móviles</span>
          </div>
        </div>
      </main>

      {/* Footer - Responsive */}
      <footer className="border-t border-border/50 bg-card/50 backdrop-blur mt-12 sm:mt-16">
        <div className="container mx-auto px-3 sm:px-4 py-4 sm:py-6 text-center text-xs sm:text-sm text-muted-foreground">
          <p>Sistema de captura de señas con detección de keypoints en tiempo real</p>
          <p className="text-xs text-muted-foreground/70 mt-1">Compatible con Android mediante Capacitor</p>
        </div>
      </footer>
    </div>
  );
};

export default Index;