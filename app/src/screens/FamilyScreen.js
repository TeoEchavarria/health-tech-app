import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Modal,
  TextInput,
  ActivityIndicator,
  RefreshControl,
  Alert
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';
import {
  getFamilies,
  createFamily,
  addFamilyMember,
  removeFamilyMember,
  deleteFamily
} from '../services/api';

export default function FamilyScreen() {
  const [families, setFamilies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [newFamilyName, setNewFamilyName] = useState('');
  const [newFamilyMembers, setNewFamilyMembers] = useState('');
  const [expandedFamilyId, setExpandedFamilyId] = useState(null);
  const [newMemberInput, setNewMemberInput] = useState({});

  // Load families
  const loadFamilies = useCallback(async () => {
    try {
      const response = await getFamilies();
      console.log('Families response:', JSON.stringify(response, null, 2));
      
      // Map families to ensure we have the correct id field
      const mappedFamilies = (response.families || []).map(family => ({
        ...family,
        id: family.id || family._id // Use id if available, otherwise use _id
      }));
      
      console.log('Mapped families:', JSON.stringify(mappedFamilies, null, 2));
      setFamilies(mappedFamilies);
    } catch (error) {
      // Error ya está clasificado y logueado por apiWrapper
      console.error('❌ Failed to load families:', error.toLogString?.() || error.message);
      
      // Mostrar mensaje específico según el tipo de error
      let errorTitle = 'Error al cargar familias';
      let errorMessage = error.userMessage?.description || error.message;
      
      if (error.type === 'NETWORK') {
        errorTitle = 'Sin conexión al servidor';
        errorMessage = 'No se puede conectar con el servidor. Verifica tu conexión a internet.';
      } else if (error.type === 'AUTH') {
        errorTitle = 'Sesión expirada';
        errorMessage = 'Por favor, inicia sesión nuevamente.';
      }
      
      Toast.show({
        type: 'error',
        text1: errorTitle,
        text2: errorMessage,
        position: 'top',
        visibilityTime: 5000,
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadFamilies();
  }, [loadFamilies]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadFamilies();
  }, [loadFamilies]);

  // Create family
  const handleCreateFamily = async () => {
    if (!newFamilyName.trim()) {
      Toast.show({
        type: 'warning',
        text1: 'Nombre requerido',
        text2: 'Por favor ingresa un nombre para la familia'
      });
      return;
    }

    try {
      const members = newFamilyMembers
        .split(',')
        .map(m => m.trim())
        .filter(m => m.length > 0);

      await createFamily(newFamilyName, members);
      
      Toast.show({
        type: 'success',
        text1: 'Familia creada',
        text2: `La familia "${newFamilyName}" fue creada exitosamente`
      });

      setCreateModalVisible(false);
      setNewFamilyName('');
      setNewFamilyMembers('');
      loadFamilies();
    } catch (error) {
      console.error('Error creating family:', error);
      Toast.show({
        type: 'error',
        text1: 'Error al crear familia',
        text2: error.response?.data?.detail || error.message
      });
    }
  };

  // Add member to family
  const handleAddMember = async (familyId) => {
    console.log('Adding member - familyId:', familyId);
    console.log('newMemberInput:', newMemberInput);
    
    const userId = newMemberInput[familyId];
    if (!userId || !userId.trim()) {
      Toast.show({
        type: 'warning',
        text1: 'ID requerido',
        text2: 'Por favor ingresa el ID del usuario'
      });
      return;
    }

    console.log('Calling addFamilyMember with:', { familyId, userId: userId.trim() });
    
    try {
      await addFamilyMember(familyId, userId.trim());
      
      Toast.show({
        type: 'success',
        text1: 'Miembro agregado',
        text2: 'El usuario fue agregado exitosamente'
      });

      setNewMemberInput({ ...newMemberInput, [familyId]: '' });
      loadFamilies();
    } catch (error) {
      console.error('Error adding member:', error);
      console.error('Error details:', error.response?.data);
      Toast.show({
        type: 'error',
        text1: 'Error al agregar miembro',
        text2: error.response?.data?.detail || error.message
      });
    }
  };

  // Remove member from family
  const handleRemoveMember = async (familyId, memberId) => {
    Alert.alert(
      'Confirmar eliminación',
      '¿Estás seguro de que deseas eliminar este miembro?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: async () => {
            try {
              await removeFamilyMember(familyId, memberId);
              
              Toast.show({
                type: 'success',
                text1: 'Miembro eliminado',
                text2: 'El usuario fue removido de la familia'
              });

              loadFamilies();
            } catch (error) {
              console.error('Error removing member:', error);
              Toast.show({
                type: 'error',
                text1: 'Error al eliminar miembro',
                text2: error.response?.data?.detail || error.message
              });
            }
          }
        }
      ]
    );
  };

  // Delete family
  const handleDeleteFamily = async (familyId, familyName) => {
    Alert.alert(
      'Eliminar familia',
      `¿Estás seguro de que deseas eliminar la familia "${familyName}"?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteFamily(familyId);
              
              Toast.show({
                type: 'success',
                text1: 'Familia eliminada',
                text2: 'La familia fue eliminada exitosamente'
              });

              loadFamilies();
            } catch (error) {
              console.error('Error deleting family:', error);
              Toast.show({
                type: 'error',
                text1: 'Error al eliminar familia',
                text2: error.response?.data?.detail || error.message
              });
            }
          }
        }
      ]
    );
  };

  // Toggle family expansion
  const toggleFamily = (familyId) => {
    setExpandedFamilyId(expandedFamilyId === familyId ? null : familyId);
  };

  // Render family item
  const renderFamilyItem = ({ item: family }) => {
    const isExpanded = expandedFamilyId === family.id;

    return (
      <View style={styles.familyCard}>
        <TouchableOpacity
          style={styles.familyHeader}
          onPress={() => toggleFamily(family.id)}
        >
          <View style={styles.familyHeaderContent}>
            <Text style={styles.familyName}>{family.name || 'Sin nombre'}</Text>
            <Text style={styles.memberCount}>{family.members.length} miembro(s)</Text>
          </View>
          <Text style={styles.expandIcon}>{isExpanded ? '▼' : '▶'}</Text>
        </TouchableOpacity>

        {isExpanded && (
          <View style={styles.familyDetails}>
            {/* Members list */}
            <Text style={styles.sectionTitle}>Miembros</Text>
            {family.members.map((memberId, index) => (
              <View key={index} style={styles.memberItem}>
                <Text style={styles.memberId}>{memberId}</Text>
                <TouchableOpacity
                  style={styles.removeButton}
                  onPress={() => handleRemoveMember(family.id, memberId)}
                >
                  <Text style={styles.removeButtonText}>✕</Text>
                </TouchableOpacity>
              </View>
            ))}

            {/* Add member */}
            <View style={styles.addMemberContainer}>
              <TextInput
                style={styles.addMemberInput}
                placeholder="ID del usuario"
                value={newMemberInput[family.id] || ''}
                onChangeText={(text) => setNewMemberInput({ ...newMemberInput, [family.id]: text })}
              />
              <TouchableOpacity
                style={styles.addButton}
                onPress={() => handleAddMember(family.id)}
              >
                <Text style={styles.addButtonText}>+</Text>
              </TouchableOpacity>
            </View>

            {/* Delete family button */}
            <TouchableOpacity
              style={styles.deleteFamilyButton}
              onPress={() => handleDeleteFamily(family.id, family.name)}
            >
              <Text style={styles.deleteFamilyButtonText}>Eliminar familia</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#007AFF" />
          <Text style={styles.loadingText}>Cargando familias...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Mis Familias</Text>
        <Text style={styles.headerSubtitle}>
          {families.length} familia(s)
        </Text>
      </View>

      {/* Families list */}
      <FlatList
        data={families}
        renderItem={renderFamilyItem}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No tienes familias</Text>
            <Text style={styles.emptySubtext}>
              Crea una nueva familia usando el botón de abajo
            </Text>
          </View>
        }
      />

      {/* Create family button */}
      <TouchableOpacity
        style={styles.createButton}
        onPress={() => setCreateModalVisible(true)}
      >
        <Text style={styles.createButtonText}>+ Crear Familia</Text>
      </TouchableOpacity>

      {/* Create family modal */}
      <Modal
        visible={createModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setCreateModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Nueva Familia</Text>

            <TextInput
              style={styles.input}
              placeholder="Nombre de la familia"
              value={newFamilyName}
              onChangeText={setNewFamilyName}
            />

            <TextInput
              style={[styles.input, styles.textArea]}
              placeholder="IDs de miembros (separados por coma)"
              value={newFamilyMembers}
              onChangeText={setNewFamilyMembers}
              multiline
              numberOfLines={3}
            />

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelButton]}
                onPress={() => {
                  setCreateModalVisible(false);
                  setNewFamilyName('');
                  setNewFamilyMembers('');
                }}
              >
                <Text style={styles.cancelButtonText}>Cancelar</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.modalButton, styles.submitButton]}
                onPress={handleCreateFamily}
              >
                <Text style={styles.submitButtonText}>Crear</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F7',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#666',
  },
  header: {
    backgroundColor: 'white',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: '#000',
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#666',
    marginTop: 4,
  },
  listContent: {
    padding: 16,
    paddingBottom: 100,
  },
  familyCard: {
    backgroundColor: 'white',
    borderRadius: 12,
    marginBottom: 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  familyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
  },
  familyHeaderContent: {
    flex: 1,
  },
  familyName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#000',
  },
  memberCount: {
    fontSize: 14,
    color: '#666',
    marginTop: 4,
  },
  expandIcon: {
    fontSize: 16,
    color: '#007AFF',
    marginLeft: 12,
  },
  familyDetails: {
    borderTopWidth: 1,
    borderTopColor: '#E5E5EA',
    padding: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
    marginBottom: 12,
  },
  memberItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#F5F5F7',
    borderRadius: 8,
    marginBottom: 8,
  },
  memberId: {
    fontSize: 14,
    color: '#333',
    flex: 1,
  },
  removeButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#FF3B30',
    justifyContent: 'center',
    alignItems: 'center',
  },
  removeButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  addMemberContainer: {
    flexDirection: 'row',
    marginTop: 12,
    marginBottom: 16,
  },
  addMemberInput: {
    flex: 1,
    height: 40,
    borderWidth: 1,
    borderColor: '#E5E5EA',
    borderRadius: 8,
    paddingHorizontal: 12,
    fontSize: 14,
    backgroundColor: 'white',
  },
  addButton: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: '#007AFF',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },
  addButtonText: {
    color: 'white',
    fontSize: 24,
    fontWeight: '300',
  },
  deleteFamilyButton: {
    backgroundColor: '#FF3B30',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  deleteFamilyButtonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#666',
  },
  emptySubtext: {
    fontSize: 14,
    color: '#999',
    marginTop: 8,
    textAlign: 'center',
  },
  createButton: {
    position: 'absolute',
    bottom: 24,
    right: 24,
    left: 24,
    backgroundColor: '#007AFF',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 8,
  },
  createButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 24,
    width: '90%',
    maxWidth: 400,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#000',
    marginBottom: 20,
  },
  input: {
    height: 48,
    borderWidth: 1,
    borderColor: '#E5E5EA',
    borderRadius: 8,
    paddingHorizontal: 12,
    fontSize: 14,
    marginBottom: 12,
    backgroundColor: 'white',
  },
  textArea: {
    height: 80,
    textAlignVertical: 'top',
    paddingTop: 12,
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  modalButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  cancelButton: {
    backgroundColor: '#E5E5EA',
    marginRight: 8,
  },
  cancelButtonText: {
    color: '#333',
    fontSize: 16,
    fontWeight: '600',
  },
  submitButton: {
    backgroundColor: '#007AFF',
    marginLeft: 8,
  },
  submitButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
});

