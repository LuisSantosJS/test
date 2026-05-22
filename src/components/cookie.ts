function getCookie(name: string): string {
    // Adiciona um ponto-e-vírgula no início para garantir que a string de nome do cookie seja encontrada corretamente
    const value = `; ${document.cookie}`;
    // Divide a string dos cookies com base no nome do cookie procurado
    const parts = value.split(`; ${name}=`);
  
    // Se não houver partes suficientes, o cookie não foi encontrado
    if (parts.length < 2) {
      return "";
    }
  
    // Pega a última parte e divide novamente para isolar o valor do cookie
    const cookieValue = parts.pop()?.split(";").shift();
    
    // Se o valor do cookie estiver definido, retorna-o, caso contrário, retorna uma string vazia
    return cookieValue ?? "";
  }

export { getCookie };
