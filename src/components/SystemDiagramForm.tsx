import React, { useState, useEffect } from 'react';
import Image from 'next/image';
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";

interface SymbolMapping {
  sheet: string;
  image_path: string;
  cell: string;
  width: number;
  height: number;
}

interface SystemDiagramSymbols {
  [key: string]: SymbolMapping[]; // <--- Changed to array
}

interface SystemDiagramFormProps {
  selectedSymbols: string[];
  onSymbolsChange: (symbols: string[]) => void;
}

const SystemDiagramForm: React.FC<SystemDiagramFormProps> = ({ selectedSymbols, onSymbolsChange }) => {
  const [availableSymbols, setAvailableSymbols] = useState<string[]>([]);
  const [symbolImagePaths, setSymbolImagePaths] = useState<{ [key: string]: string }>({});

  useEffect(() => {
    const fetchSymbolData = async () => {
      try {
        // Fetch symbol names (already normalized)
        const namesResponse = await fetch('/api/system-diagram-names');
        if (!namesResponse.ok) {
          throw new Error(`Failed to fetch symbol names: ${namesResponse.statusText}`);
        }
        const namesData: string[] = await namesResponse.json();
        setAvailableSymbols(namesData);

        // Fetch symbol details for images
        const symbolsResponse = await fetch('/api/system-diagram-symbols');
        if (!symbolsResponse.ok) {
          throw new Error(`Failed to fetch symbol details: ${symbolsResponse.statusText}`);
        }
        const symbolsData: SystemDiagramSymbols = await symbolsResponse.json();
        
        const imagePaths: { [key: string]: string } = {};
        for (const key in symbolsData) {
          const normalizedKey = key.normalize('NFC');
          if (symbolsData[key] && symbolsData[key].length > 0) {
            imagePaths[normalizedKey] = symbolsData[key][0].image_path;
          }
        }
        setSymbolImagePaths(imagePaths);

      } catch (error) {
        console.error('Error fetching system diagram data:', error);
      }
    };

    fetchSymbolData();
  }, []);

  const handleSymbolChange = (symbol: string, checked: boolean) => {
    const newSelectedSymbols = checked
      ? [...selectedSymbols, symbol]
      : selectedSymbols.filter((s) => s !== symbol);
    onSymbolsChange(newSelectedSymbols);
  };

  return (
    <div className="mt-4 p-4 border rounded-lg shadow-sm">
      
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
        {availableSymbols.map((tag) => (
          <div key={tag} className="flex items-center space-x-2">
            <Checkbox
              id={tag}
              checked={selectedSymbols.includes(tag)}
              onCheckedChange={(checked) => {
                handleSymbolChange(tag, !!checked);
              }}
            />
            <Label htmlFor={tag} className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
              {tag}
            </Label>
          </div>
        ))}
      </div>

      {selectedSymbols.length > 0 && (
        <div className="mt-6">
          <h4 className="text-md font-semibold mb-2">選択中の記号:</h4>
          <div className="flex flex-wrap gap-4 p-2 border rounded-md bg-muted/50">
            {selectedSymbols.map((symbol) => {
              const imagePath = symbolImagePaths[symbol];
              if (!imagePath) return null;
              return (
                <div key={symbol} className="flex flex-col items-center gap-1">
                  <div className="relative w-12 h-12">
                    <Image
                      src={imagePath.replace('public/', '/')}
                      alt={symbol}
                      layout="fill"
                      objectFit="contain"
                    />
                  </div>
                  <span className="text-xs">{symbol}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default SystemDiagramForm;
