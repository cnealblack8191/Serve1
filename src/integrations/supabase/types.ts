export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      app_owners: {
        Row: {
          created_at: string
          note: string
          user_id: string
        }
        Insert: {
          created_at?: string
          note?: string
          user_id: string
        }
        Update: {
          created_at?: string
          note?: string
          user_id?: string
        }
        Relationships: []
      }
      approval_records: {
        Row: {
          approver: string
          at: string | null
          bid_id: string
          comment: string | null
          created_at: string
          id: string
          role: string
          status: string
        }
        Insert: {
          approver?: string
          at?: string | null
          bid_id: string
          comment?: string | null
          created_at?: string
          id: string
          role?: string
          status?: string
        }
        Update: {
          approver?: string
          at?: string | null
          bid_id?: string
          comment?: string | null
          created_at?: string
          id?: string
          role?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "approval_records_bid_id_fkey"
            columns: ["bid_id"]
            isOneToOne: false
            referencedRelation: "bids"
            referencedColumns: ["id"]
          },
        ]
      }
      bid_intake: {
        Row: {
          attachments: Json
          body_preview: string
          candidate_customers: Json
          confidence: number
          created_at: string
          customer_match: string
          decided_at: string | null
          decided_by: string | null
          decision_note: string
          extracted: Json
          field_confidence: Json
          from_address: string
          from_name: string
          id: string
          intake_source: string
          is_bid_invitation: boolean
          links: Json
          matched_customer: string | null
          message_id: string | null
          needs_review: boolean
          opportunity_id: string | null
          received_at: string
          review_reasons: Json
          status: string
          subject: string
          thread_id: string | null
          updated_at: string
        }
        Insert: {
          attachments?: Json
          body_preview?: string
          candidate_customers?: Json
          confidence?: number
          created_at?: string
          customer_match?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string
          extracted?: Json
          field_confidence?: Json
          from_address?: string
          from_name?: string
          id?: string
          intake_source?: string
          is_bid_invitation?: boolean
          links?: Json
          matched_customer?: string | null
          message_id?: string | null
          needs_review?: boolean
          opportunity_id?: string | null
          received_at?: string
          review_reasons?: Json
          status?: string
          subject?: string
          thread_id?: string | null
          updated_at?: string
        }
        Update: {
          attachments?: Json
          body_preview?: string
          candidate_customers?: Json
          confidence?: number
          created_at?: string
          customer_match?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string
          extracted?: Json
          field_confidence?: Json
          from_address?: string
          from_name?: string
          id?: string
          intake_source?: string
          is_bid_invitation?: boolean
          links?: Json
          matched_customer?: string | null
          message_id?: string | null
          needs_review?: boolean
          opportunity_id?: string | null
          received_at?: string
          review_reasons?: Json
          status?: string
          subject?: string
          thread_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bid_intake_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bid_intake_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "message_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      bids: {
        Row: {
          activity: Json
          address: string
          approval_group: string
          created_at: string
          customer: string
          division: string
          id: string
          job_id: string | null
          job_type: string
          name: string
          opportunity_id: string
          owner: string
          package_links: Json
          pdf_generated: boolean
          rate_type: string
          sent_at: string | null
          stage: string
          stage_changed_at: string
        }
        Insert: {
          activity?: Json
          address?: string
          approval_group?: string
          created_at?: string
          customer?: string
          division?: string
          id: string
          job_id?: string | null
          job_type?: string
          name: string
          opportunity_id?: string
          owner?: string
          package_links?: Json
          pdf_generated?: boolean
          rate_type?: string
          sent_at?: string | null
          stage?: string
          stage_changed_at?: string
        }
        Update: {
          activity?: Json
          address?: string
          approval_group?: string
          created_at?: string
          customer?: string
          division?: string
          id?: string
          job_id?: string | null
          job_type?: string
          name?: string
          opportunity_id?: string
          owner?: string
          package_links?: Json
          pdf_generated?: boolean
          rate_type?: string
          sent_at?: string | null
          stage?: string
          stage_changed_at?: string
        }
        Relationships: []
      }
      customers: {
        Row: {
          billing_address: string
          contact_email: string
          contact_phone: string
          created_at: string
          id: string
          markup_table: Json
          name: string
          quote_format: string
          rate_type: string
        }
        Insert: {
          billing_address?: string
          contact_email?: string
          contact_phone?: string
          created_at?: string
          id: string
          markup_table?: Json
          name: string
          quote_format?: string
          rate_type?: string
        }
        Update: {
          billing_address?: string
          contact_email?: string
          contact_phone?: string
          created_at?: string
          id?: string
          markup_table?: Json
          name?: string
          quote_format?: string
          rate_type?: string
        }
        Relationships: []
      }
      document_links: {
        Row: {
          created_at: string
          document_id: string
          id: string
          label: string
          linked_by: string
          record_id: string
          record_type: string
        }
        Insert: {
          created_at?: string
          document_id: string
          id?: string
          label?: string
          linked_by?: string
          record_id: string
          record_type: string
        }
        Update: {
          created_at?: string
          document_id?: string
          id?: string
          label?: string
          linked_by?: string
          record_id?: string
          record_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_links_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "document_refs"
            referencedColumns: ["id"]
          },
        ]
      }
      document_locations: {
        Row: {
          created_at: string
          drive_id: string | null
          folder_item_id: string | null
          folder_path: string
          id: string
          provisioned: boolean
          record_id: string
          record_type: string
          site_id: string | null
          updated_at: string
          web_url: string
        }
        Insert: {
          created_at?: string
          drive_id?: string | null
          folder_item_id?: string | null
          folder_path?: string
          id?: string
          provisioned?: boolean
          record_id: string
          record_type: string
          site_id?: string | null
          updated_at?: string
          web_url?: string
        }
        Update: {
          created_at?: string
          drive_id?: string | null
          folder_item_id?: string | null
          folder_path?: string
          id?: string
          provisioned?: boolean
          record_id?: string
          record_type?: string
          site_id?: string | null
          updated_at?: string
          web_url?: string
        }
        Relationships: []
      }
      document_refs: {
        Row: {
          created_at: string
          created_by_name: string
          drive_id: string | null
          etag: string | null
          extension: string
          folder_path: string
          generated_kind: string | null
          id: string
          item_id: string | null
          kind: string
          modified_at: string
          name: string
          origin: string
          provider: string
          site_id: string | null
          size_bytes: number | null
          updated_at: string
          web_url: string
        }
        Insert: {
          created_at?: string
          created_by_name?: string
          drive_id?: string | null
          etag?: string | null
          extension?: string
          folder_path?: string
          generated_kind?: string | null
          id?: string
          item_id?: string | null
          kind?: string
          modified_at?: string
          name: string
          origin?: string
          provider?: string
          site_id?: string | null
          size_bytes?: number | null
          updated_at?: string
          web_url?: string
        }
        Update: {
          created_at?: string
          created_by_name?: string
          drive_id?: string | null
          etag?: string | null
          extension?: string
          folder_path?: string
          generated_kind?: string | null
          id?: string
          item_id?: string | null
          kind?: string
          modified_at?: string
          name?: string
          origin?: string
          provider?: string
          site_id?: string | null
          size_bytes?: number | null
          updated_at?: string
          web_url?: string
        }
        Relationships: []
      }
      email_records: {
        Row: {
          at: string
          attachments: Json
          body: string
          created_at: string
          id: string
          recipient: string
          record_id: string
          subject: string
        }
        Insert: {
          at?: string
          attachments?: Json
          body?: string
          created_at?: string
          id: string
          recipient?: string
          record_id?: string
          subject?: string
        }
        Update: {
          at?: string
          attachments?: Json
          body?: string
          created_at?: string
          id?: string
          recipient?: string
          record_id?: string
          subject?: string
        }
        Relationships: []
      }
      employees: {
        Row: {
          active: boolean
          added_at: string
          created_at: string
          email: string
          id: string
          name: string
          phone: string
          role: Database["public"]["Enums"]["app_role"]
        }
        Insert: {
          active?: boolean
          added_at?: string
          created_at?: string
          email?: string
          id: string
          name: string
          phone?: string
          role?: Database["public"]["Enums"]["app_role"]
        }
        Update: {
          active?: boolean
          added_at?: string
          created_at?: string
          email?: string
          id?: string
          name?: string
          phone?: string
          role?: Database["public"]["Enums"]["app_role"]
        }
        Relationships: []
      }
      invoices: {
        Row: {
          amount: number
          balance: number
          created_at: string
          customer: string
          due: string
          id: string
          issued: string
          job_id: string
          job_name: string
          notes: Json
          number: string
          status: string
        }
        Insert: {
          amount?: number
          balance?: number
          created_at?: string
          customer?: string
          due?: string
          id: string
          issued?: string
          job_id?: string
          job_name?: string
          notes?: Json
          number?: string
          status?: string
        }
        Update: {
          amount?: number
          balance?: number
          created_at?: string
          customer?: string
          due?: string
          id?: string
          issued?: string
          job_id?: string
          job_name?: string
          notes?: Json
          number?: string
          status?: string
        }
        Relationships: []
      }
      jobs: {
        Row: {
          activity: Json
          address: string
          bid_id: string | null
          contacts: Json
          contract_value: number
          created_at: string
          customer: string
          division: string
          documents: Json
          id: string
          manager: string
          name: string
          phase: string
          spectrum_number: string
          spectrum_sync: string
          status: string
        }
        Insert: {
          activity?: Json
          address?: string
          bid_id?: string | null
          contacts?: Json
          contract_value?: number
          created_at?: string
          customer?: string
          division?: string
          documents?: Json
          id: string
          manager?: string
          name: string
          phase?: string
          spectrum_number?: string
          spectrum_sync?: string
          status?: string
        }
        Update: {
          activity?: Json
          address?: string
          bid_id?: string | null
          contacts?: Json
          contract_value?: number
          created_at?: string
          customer?: string
          division?: string
          documents?: Json
          id?: string
          manager?: string
          name?: string
          phase?: string
          spectrum_number?: string
          spectrum_sync?: string
          status?: string
        }
        Relationships: []
      }
      line_items: {
        Row: {
          bid_id: string
          category: string
          cost_code: string
          created_at: string
          customer_description: string
          description: string
          id: string
          internal_note: string
          markup: number
          position: number
          qty: number
          unit: string
          unit_cost: number
        }
        Insert: {
          bid_id: string
          category?: string
          cost_code?: string
          created_at?: string
          customer_description?: string
          description?: string
          id: string
          internal_note?: string
          markup?: number
          position?: number
          qty?: number
          unit?: string
          unit_cost?: number
        }
        Update: {
          bid_id?: string
          category?: string
          cost_code?: string
          created_at?: string
          customer_description?: string
          description?: string
          id?: string
          internal_note?: string
          markup?: number
          position?: number
          qty?: number
          unit?: string
          unit_cost?: number
        }
        Relationships: [
          {
            foreignKeyName: "line_items_bid_id_fkey"
            columns: ["bid_id"]
            isOneToOne: false
            referencedRelation: "bids"
            referencedColumns: ["id"]
          },
        ]
      }
      mailbox_sync_state: {
        Row: {
          connected: boolean
          delta_token: string | null
          folder: string
          id: string
          last_error: string
          last_synced_at: string | null
          mailbox_address: string
          updated_at: string
        }
        Insert: {
          connected?: boolean
          delta_token?: string | null
          folder?: string
          id: string
          last_error?: string
          last_synced_at?: string | null
          mailbox_address?: string
          updated_at?: string
        }
        Update: {
          connected?: boolean
          delta_token?: string | null
          folder?: string
          id?: string
          last_error?: string
          last_synced_at?: string | null
          mailbox_address?: string
          updated_at?: string
        }
        Relationships: []
      }
      material_requests: {
        Row: {
          created_at: string
          id: string
          item: string
          job_id: string
          job_name: string
          notes: string
          po_number: string | null
          qty: string
          requested_at: string
          requested_by: string
          status: string
          work_order: string
        }
        Insert: {
          created_at?: string
          id: string
          item?: string
          job_id?: string
          job_name?: string
          notes?: string
          po_number?: string | null
          qty?: string
          requested_at?: string
          requested_by?: string
          status?: string
          work_order?: string
        }
        Update: {
          created_at?: string
          id?: string
          item?: string
          job_id?: string
          job_name?: string
          notes?: string
          po_number?: string | null
          qty?: string
          requested_at?: string
          requested_by?: string
          status?: string
          work_order?: string
        }
        Relationships: []
      }
      message_attachments: {
        Row: {
          created_at: string
          document_id: string | null
          extension: string
          graph_attachment_id: string | null
          id: string
          inline: boolean
          message_id: string
          name: string
          size_bytes: number | null
          web_url: string
        }
        Insert: {
          created_at?: string
          document_id?: string | null
          extension?: string
          graph_attachment_id?: string | null
          id?: string
          inline?: boolean
          message_id: string
          name?: string
          size_bytes?: number | null
          web_url?: string
        }
        Update: {
          created_at?: string
          document_id?: string | null
          extension?: string
          graph_attachment_id?: string | null
          id?: string
          inline?: boolean
          message_id?: string
          name?: string
          size_bytes?: number | null
          web_url?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_attachments_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "document_refs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_attachments_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      message_links: {
        Row: {
          auto_matched: boolean
          created_at: string
          id: string
          linked_by: string
          message_id: string | null
          record_id: string
          record_type: string
          thread_id: string | null
        }
        Insert: {
          auto_matched?: boolean
          created_at?: string
          id?: string
          linked_by?: string
          message_id?: string | null
          record_id: string
          record_type: string
          thread_id?: string | null
        }
        Update: {
          auto_matched?: boolean
          created_at?: string
          id?: string
          linked_by?: string
          message_id?: string | null
          record_id?: string
          record_type?: string
          thread_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "message_links_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_links_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "message_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      message_threads: {
        Row: {
          created_at: string
          folder: string
          graph_conversation_id: string | null
          has_attachments: boolean
          id: string
          last_message_at: string
          message_count: number
          participants: Json
          preview: string
          subject: string
          unread_count: number
        }
        Insert: {
          created_at?: string
          folder?: string
          graph_conversation_id?: string | null
          has_attachments?: boolean
          id?: string
          last_message_at?: string
          message_count?: number
          participants?: Json
          preview?: string
          subject?: string
          unread_count?: number
        }
        Update: {
          created_at?: string
          folder?: string
          graph_conversation_id?: string | null
          has_attachments?: boolean
          id?: string
          last_message_at?: string
          message_count?: number
          participants?: Json
          preview?: string
          subject?: string
          unread_count?: number
        }
        Relationships: []
      }
      messages: {
        Row: {
          bcc_addresses: Json
          body_html: string
          body_preview: string
          cc_addresses: Json
          created_at: string
          delivery_detail: string
          delivery_status: string
          direction: string
          folder: string
          from_address: string
          from_name: string
          graph_message_id: string | null
          has_attachments: boolean
          id: string
          internet_message_id: string | null
          is_draft: boolean
          is_read: boolean
          purpose: string
          received_at: string | null
          sent_at: string | null
          sent_by: string | null
          sent_by_name: string
          source: string
          subject: string
          thread_id: string
          to_addresses: Json
        }
        Insert: {
          bcc_addresses?: Json
          body_html?: string
          body_preview?: string
          cc_addresses?: Json
          created_at?: string
          delivery_detail?: string
          delivery_status?: string
          direction?: string
          folder?: string
          from_address?: string
          from_name?: string
          graph_message_id?: string | null
          has_attachments?: boolean
          id?: string
          internet_message_id?: string | null
          is_draft?: boolean
          is_read?: boolean
          purpose?: string
          received_at?: string | null
          sent_at?: string | null
          sent_by?: string | null
          sent_by_name?: string
          source?: string
          subject?: string
          thread_id: string
          to_addresses?: Json
        }
        Update: {
          bcc_addresses?: Json
          body_html?: string
          body_preview?: string
          cc_addresses?: Json
          created_at?: string
          delivery_detail?: string
          delivery_status?: string
          direction?: string
          folder?: string
          from_address?: string
          from_name?: string
          graph_message_id?: string | null
          has_attachments?: boolean
          id?: string
          internet_message_id?: string | null
          is_draft?: boolean
          is_read?: boolean
          purpose?: string
          received_at?: string | null
          sent_at?: string | null
          sent_by?: string | null
          sent_by_name?: string
          source?: string
          subject?: string
          thread_id?: string
          to_addresses?: Json
        }
        Relationships: [
          {
            foreignKeyName: "messages_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "message_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      ms365_settings: {
        Row: {
          client_id: string | null
          client_secret: string | null
          drive_id: string | null
          id: string
          shared_mailbox: string | null
          site_id: string | null
          tenant_id: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          client_id?: string | null
          client_secret?: string | null
          drive_id?: string | null
          id?: string
          shared_mailbox?: string | null
          site_id?: string | null
          tenant_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          client_id?: string | null
          client_secret?: string | null
          drive_id?: string | null
          id?: string
          shared_mailbox?: string | null
          site_id?: string | null
          tenant_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      notifications: {
        Row: {
          at: string
          created_at: string
          dedupe_key: string | null
          detail: string
          id: string
          kind: string
          read: boolean
          title: string
          user_id: string | null
        }
        Insert: {
          at?: string
          created_at?: string
          dedupe_key?: string | null
          detail?: string
          id: string
          kind?: string
          read?: boolean
          title?: string
          user_id?: string | null
        }
        Update: {
          at?: string
          created_at?: string
          dedupe_key?: string | null
          detail?: string
          id?: string
          kind?: string
          read?: boolean
          title?: string
          user_id?: string | null
        }
        Relationships: []
      }
      opportunities: {
        Row: {
          activity: Json
          address: string
          assigned_to: string
          bid_id: string | null
          contact_name: string
          contacts: Json
          created_at: string
          customer: string
          description: string
          division: string
          documents: Json
          expected_bid_date: string
          id: string
          job_type: string
          name: string
          notes: string
          rate_type: string
          source: string
          stage: string
          value: number
        }
        Insert: {
          activity?: Json
          address?: string
          assigned_to?: string
          bid_id?: string | null
          contact_name?: string
          contacts?: Json
          created_at?: string
          customer?: string
          description?: string
          division?: string
          documents?: Json
          expected_bid_date?: string
          id: string
          job_type?: string
          name: string
          notes?: string
          rate_type?: string
          source?: string
          stage?: string
          value?: number
        }
        Update: {
          activity?: Json
          address?: string
          assigned_to?: string
          bid_id?: string | null
          contact_name?: string
          contacts?: Json
          created_at?: string
          customer?: string
          description?: string
          division?: string
          documents?: Json
          expected_bid_date?: string
          id?: string
          job_type?: string
          name?: string
          notes?: string
          rate_type?: string
          source?: string
          stage?: string
          value?: number
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          notification_prefs: Json
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          notification_prefs?: Json
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          notification_prefs?: Json
        }
        Relationships: []
      }
      receipts: {
        Row: {
          amount: number
          at: string
          complete: boolean
          created_at: string
          id: string
          job_id: string
          job_name: string
          matched: boolean
          missing_docs: boolean
          notes: Json
          po_number: string | null
          submitted_by: string
          vendor: string
          work_order: string
        }
        Insert: {
          amount?: number
          at?: string
          complete?: boolean
          created_at?: string
          id: string
          job_id?: string
          job_name?: string
          matched?: boolean
          missing_docs?: boolean
          notes?: Json
          po_number?: string | null
          submitted_by?: string
          vendor?: string
          work_order?: string
        }
        Update: {
          amount?: number
          at?: string
          complete?: boolean
          created_at?: string
          id?: string
          job_id?: string
          job_name?: string
          matched?: boolean
          missing_docs?: boolean
          notes?: Json
          po_number?: string | null
          submitted_by?: string
          vendor?: string
          work_order?: string
        }
        Relationships: []
      }
      reminders: {
        Row: {
          assigned_to: string
          created_at: string
          created_at_label: string
          done: boolean
          due: string
          id: string
          note: string
          record_id: string
          title: string
        }
        Insert: {
          assigned_to?: string
          created_at?: string
          created_at_label?: string
          done?: boolean
          due?: string
          id: string
          note?: string
          record_id?: string
          title?: string
        }
        Update: {
          assigned_to?: string
          created_at?: string
          created_at_label?: string
          done?: boolean
          due?: string
          id?: string
          note?: string
          record_id?: string
          title?: string
        }
        Relationships: []
      }
      role_permissions: {
        Row: {
          permission: Database["public"]["Enums"]["app_permission"]
          role: Database["public"]["Enums"]["app_role"]
        }
        Insert: {
          permission: Database["public"]["Enums"]["app_permission"]
          role: Database["public"]["Enums"]["app_role"]
        }
        Update: {
          permission?: Database["public"]["Enums"]["app_permission"]
          role?: Database["public"]["Enums"]["app_role"]
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      work_orders: {
        Row: {
          arrival: string | null
          completion: Json | null
          created_at: string
          description: string | null
          id: string
          job_id: string
          notes: Json
          number: string
          photos: Json | null
          priority: string
          scheduled: string
          site_contact: string | null
          site_contact_phone: string | null
          status: string
          tasks: Json
          technician: string
          title: string
        }
        Insert: {
          arrival?: string | null
          completion?: Json | null
          created_at?: string
          description?: string | null
          id: string
          job_id?: string
          notes?: Json
          number?: string
          photos?: Json | null
          priority?: string
          scheduled?: string
          site_contact?: string | null
          site_contact_phone?: string | null
          status?: string
          tasks?: Json
          technician?: string
          title?: string
        }
        Update: {
          arrival?: string | null
          completion?: Json | null
          created_at?: string
          description?: string | null
          id?: string
          job_id?: string
          notes?: Json
          number?: string
          photos?: Json | null
          priority?: string
          scheduled?: string
          site_contact?: string | null
          site_contact_phone?: string | null
          status?: string
          tasks?: Json
          technician?: string
          title?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      ensure_profile: { Args: never; Returns: Json }
      has_permission: {
        Args: {
          _perm: Database["public"]["Enums"]["app_permission"]
          _user_id: string
        }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_owner: { Args: { _user_id: string }; Returns: boolean }
    }
    Enums: {
      app_permission:
        | "dashboard"
        | "crm"
        | "bids"
        | "jobs"
        | "materials"
        | "invoices"
        | "ap"
        | "approve_quotes"
        | "send_email"
        | "manage_permissions"
        | "field"
      app_role:
        | "Admin"
        | "Division Manager"
        | "Service Manager"
        | "Coordinator"
        | "AP/AR"
        | "Field"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
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
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
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
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
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
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_permission: [
        "dashboard",
        "crm",
        "bids",
        "jobs",
        "materials",
        "invoices",
        "ap",
        "approve_quotes",
        "send_email",
        "manage_permissions",
        "field",
      ],
      app_role: [
        "Admin",
        "Division Manager",
        "Service Manager",
        "Coordinator",
        "AP/AR",
        "Field",
      ],
    },
  },
} as const
