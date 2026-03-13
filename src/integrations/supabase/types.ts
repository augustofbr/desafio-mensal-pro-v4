export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      automation_logs: {
        Row: {
          created_at: string | null
          id: number
          is_error: boolean | null
          message: string
        }
        Insert: {
          created_at?: string | null
          id?: number
          is_error?: boolean | null
          message: string
        }
        Update: {
          created_at?: string | null
          id?: number
          is_error?: boolean | null
          message?: string
        }
        Relationships: []
      }
      prof_servicos: {
        Row: {
          apelido: string | null
          created_at: string
          id: number
          nome_profissional: string | null
          nome_servico: string | null
          profissionalid: string | null
          servicoid: string | null
        }
        Insert: {
          apelido?: string | null
          created_at?: string
          id?: number
          nome_profissional?: string | null
          nome_servico?: string | null
          profissionalid?: string | null
          servicoid?: string | null
        }
        Update: {
          apelido?: string | null
          created_at?: string
          id?: number
          nome_profissional?: string | null
          nome_servico?: string | null
          profissionalid?: string | null
          servicoid?: string | null
        }
        Relationships: []
      }
      servicos: {
        Row: {
          categoria: string | null
          descricao: string | null
          duracaoemminutos: number | null
          nome: string | null
          preco: number | null
          servicoid: string
          tipo_preco: string | null
          visivelparacliente: boolean | null
        }
        Insert: {
          categoria?: string | null
          descricao?: string | null
          duracaoemminutos?: number | null
          nome?: string | null
          preco?: number | null
          servicoid: string
          tipo_preco?: string | null
          visivelparacliente?: boolean | null
        }
        Update: {
          categoria?: string | null
          descricao?: string | null
          duracaoemminutos?: number | null
          nome?: string | null
          preco?: number | null
          servicoid?: string
          tipo_preco?: string | null
          visivelparacliente?: boolean | null
        }
        Relationships: []
      }
      trinks_services: {
        Row: {
          category: string | null
          client_name: string | null
          created_at: string | null
          id: number
          produto_name: string | null
          produtoid: string | null
          professional: string | null
          profissionalid: string | null
          service_date: string | null
          service_name: string | null
          servicoid: string | null
          value: number | null
        }
        Insert: {
          category?: string | null
          client_name?: string | null
          created_at?: string | null
          id?: number
          produto_name?: string | null
          produtoid?: string | null
          professional?: string | null
          profissionalid?: string | null
          service_date?: string | null
          service_name?: string | null
          servicoid?: string | null
          value?: number | null
        }
        Update: {
          category?: string | null
          client_name?: string | null
          created_at?: string | null
          id?: number
          produto_name?: string | null
          produtoid?: string | null
          professional?: string | null
          profissionalid?: string | null
          service_date?: string | null
          service_name?: string | null
          servicoid?: string | null
          value?: number | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      unaccent: {
        Args: { "": string }
        Returns: string
      }
      unaccent_init: {
        Args: { "": unknown }
        Returns: unknown
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DefaultSchema = Database[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof (Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        Database[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof Database }
  ? (Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      Database[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof Database }
  ? Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof Database }
  ? Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof Database },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof Database }
  ? Database[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof Database },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof Database }
  ? Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
