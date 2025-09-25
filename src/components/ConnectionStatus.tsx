import React, { useState, useEffect } from 'react';
import { Badge } from '@/components/ui/badge';
import { Wifi, WifiOff, Cloud, Smartphone } from 'lucide-react';
import { hybridSignService } from '@/lib/hybridSignService';

export const ConnectionStatus: React.FC = () => {
  const [status, setStatus] = useState({ isOnline: false, hasSupabaseAuth: false });

  useEffect(() => {
    const updateStatus = () => {
      const currentStatus = hybridSignService.getConnectionStatus();
      setStatus(currentStatus);
    };

    // Initial status
    updateStatus();

    // Listen for online/offline events
    window.addEventListener('online', updateStatus);
    window.addEventListener('offline', updateStatus);

    return () => {
      window.removeEventListener('online', updateStatus);
      window.removeEventListener('offline', updateStatus);
    };
  }, []);

  const getStatusInfo = () => {
    if (status.isOnline && status.hasSupabaseAuth) {
      return {
        icon: <Cloud className="w-3 h-3" />,
        text: "Sincronizado",
        variant: "default" as const,
        description: "Datos guardados en la nube"
      };
    } else if (status.isOnline && !status.hasSupabaseAuth) {
      return {
        icon: <Wifi className="w-3 h-3" />,
        text: "En línea",
        variant: "secondary" as const,
        description: "Conectado, usando almacenamiento local"
      };
    } else {
      return {
        icon: <Smartphone className="w-3 h-3" />,
        text: "Offline",
        variant: "outline" as const,
        description: "Modo offline, datos guardados localmente"
      };
    }
  };

  const statusInfo = getStatusInfo();

  return (
    <div className="flex items-center gap-2">
      <Badge variant={statusInfo.variant} className="text-xs">
        {statusInfo.icon}
        <span className="ml-1 hidden sm:inline">{statusInfo.text}</span>
      </Badge>
      <span className="text-xs text-muted-foreground hidden md:inline">
        {statusInfo.description}
      </span>
    </div>
  );
};