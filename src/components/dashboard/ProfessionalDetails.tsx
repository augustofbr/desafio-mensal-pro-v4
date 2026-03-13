
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { X } from "lucide-react";

interface ProfessionalDetailsProps {
  details: any;
  onClose: () => void;
  category: string;
}

export default function ProfessionalDetails({ details, onClose, category }: ProfessionalDetailsProps) {
  if (!details) return null;

  return (
    <Card className="w-full">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <div>
          <CardTitle className="text-xl">{details.professional}</CardTitle>
          <CardDescription className="mt-1">
            {category}: {details.totalServices} serviços | {details.totalPoints} pontos
          </CardDescription>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose}>
          <X className="h-5 w-5" />
        </Button>
      </CardHeader>
      <CardContent>
        {details.services.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-gray-500">Nenhum serviço registrado para este mês.</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Serviço</TableHead>
                <TableHead className="text-center">Quantidade</TableHead>
                <TableHead className="text-right">Pontos</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {details.services.map((service: any) => (
                <TableRow key={service.name}>
                  <TableCell><div className="font-medium">{service.name}</div></TableCell>
                  <TableCell className="text-center">{service.count}</TableCell>
                  <TableCell className="text-right font-medium">
                    {service.points}
                    <span className="text-xs text-muted-foreground ml-1">
                      ({service.pointsPerService} por serviço)
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
