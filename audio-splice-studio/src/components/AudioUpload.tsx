import { useState, useRef, DragEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Upload, Music, FileAudio } from 'lucide-react';
import { cn } from '@/lib/utils';

interface AudioUploadProps {
  onFileUpload: (file: File) => void;
  isProcessing: boolean;
}

export const AudioUpload = ({ onFileUpload, isProcessing }: AudioUploadProps) => {
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = (e: DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = (e: DragEvent) => {
    e.preventDefault();
    setDragOver(false);
  };

  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      const file = files[0];
      if (file.type.startsWith('audio/')) {
        onFileUpload(file);
      }
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      onFileUpload(files[0]);
    }
  };

  const openFileDialog = () => {
    fileInputRef.current?.click();
  };

  return (
    <Card className={cn(
      "upload-zone",
      dragOver && "dragover",
      isProcessing && "pointer-events-none opacity-50"
    )}>
      <CardContent 
        className="p-12 text-center cursor-pointer"
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={openFileDialog}
      >
        <div className="flex flex-col items-center gap-6">
          <div className="relative">
            <div className="absolute inset-0 animate-glow-pulse rounded-full bg-primary/20"></div>
            <div className="relative bg-card-elevated p-6 rounded-full border border-primary/30">
              <Music className="h-12 w-12 text-primary" />
            </div>
          </div>
          
          <div className="space-y-2">
            <h3 className="text-2xl font-semibold bg-gradient-primary bg-clip-text text-transparent">
              Upload Your Song
            </h3>
            <p className="text-muted-foreground max-w-md">
              Drag and drop your audio file here, or click to browse. We support MP3, WAV, and other audio formats.
            </p>
          </div>

          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              <FileAudio className="h-4 w-4" />
              <span>MP3, WAV</span>
            </div>
            <div className="flex items-center gap-2">
              <Upload className="h-4 w-4" />
              <span>Max 50MB</span>
            </div>
          </div>

          <Button 
            variant="neon" 
            size="lg" 
            className="font-semibold"
            disabled={isProcessing}
          >
            <Upload className="h-5 w-5" />
            Select Audio File
          </Button>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="audio/*"
          onChange={handleFileSelect}
          className="hidden"
        />
      </CardContent>
    </Card>
  );
};